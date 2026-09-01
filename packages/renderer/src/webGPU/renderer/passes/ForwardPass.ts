import { PMXModel } from '@renderer/assets/PMXModel';
import { FrameData, RenderData } from '@renderer/frame/types';
import { GeometryManager } from '../../core/GeometryManager';
import { MaterialBinder, MaterialBindings } from '../../core/MaterialBinder';
import { MVPUniformManager } from '../../core/MVPUniformManager';
import { PipelineFactory } from '../../core/pipeline/PipelineFactory';
import { PMXAnimationBufferManager } from '../../core/PMXAnimationBufferManager';
import { PMXMaterialProcessor } from '../../core/PMXMaterialProcessor';
import { WebGPUResourceManager } from '../../core/ResourceManager';
import { GeometryCacheItem } from '../../core/types';
import { buildDrawLists, DrawItem } from '../frame/DrawListBuilder';
import { sceneSettings } from '../sceneSettings';
import { HGRPEyeOverlayStage } from './HGRPEyeOverlayStage';
import { HGRPOutlineStage } from './HGRPOutlineStage';

// GPU resources resolved once per frame during prepare, consumed by the synchronous encode.
interface FrameResources {
  pipelines: Map<string, GPURenderPipeline>;
  materials: Map<string, MaterialBindings>;
  pmxAnimations: Map<string, GPUBindGroup | undefined>; // keyed by pmxAssetId
}

// Last-bound state during encode; a bind is only re-issued when its identity key changes.
interface EncodeStateCache {
  pipelineKey?: string;
  materialKey?: string;
  geometryId?: string;
  uniformKey?: string;
}

export interface ForwardPassDeps {
  pipelineFactory: PipelineFactory;
  geometryManager: GeometryManager;
  mvpUniformManager: MVPUniformManager;
  materialBinder: MaterialBinder;
  pmxMaterialProcessor: PMXMaterialProcessor;
  pmxAnimationBufferManager: PMXAnimationBufferManager;
  resourceManager: WebGPUResourceManager;
  outlineStage: HGRPOutlineStage;
  eyeOverlayStage: HGRPEyeOverlayStage;
  // Attachment views are provided as closures because the swapchain texture changes every
  // frame and the depth texture is recreated on resize.
  getColorView(): GPUTextureView;
  getDepthView(): GPUTextureView;
  // HGRP group 3 (per-frame globals: prepass depth for the screen-space rim)
  getHGRPFrameBindGroup(): GPUBindGroup;
}

/**
 * Forward Pass
 *
 * The renderer's single render pass: forward shading — geometry and lighting are computed in
 * one pass writing directly to the swapchain color + depth attachments (as opposed to a
 * deferred G-buffer chain). A render pass is the unit that resolves and draws its own draw
 * lists into an encoder, so it owns all three steps: the attachment descriptors, the async
 * prepare phase (per-frame GPU-resource resolution, deduplicated per identity key), and the
 * fully synchronous encode phase (state-cached walk) — sorted opaque first, then back-to-front
 * transparent. Renderer-private orchestration wired by constructor, not a DI service.
 * Identity keys and ordering contract: docs/renderer-frame-contract.md.
 */
export class ForwardPass {
  constructor(private readonly deps: ForwardPassDeps) {}

  async execute(commandEncoder: GPUCommandEncoder, frameData: FrameData): Promise<void> {
    // Prepare phase (async): build the ordered draw lists and resolve every GPU resource up
    // front, so the encode phase below is fully synchronous — no await between beginRenderPass
    // and end.
    const { opaque, transparent, outline, eyeOverlay } = buildDrawLists(frameData);
    const frame: FrameResources = {
      pipelines: new Map(),
      materials: new Map(),
      pmxAnimations: new Map(),
    };
    await this.prepare(opaque, frame);
    await this.prepare(transparent, frame);
    await this.deps.outlineStage.prepare(outline);
    await this.deps.eyeOverlayStage.prepare(eyeOverlay);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'main_render_pass',
      colorAttachments: [
        {
          view: this.deps.getColorView(),
          clearValue: [...sceneSettings.clearColor, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.deps.getDepthView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        stencilClearValue: 0,
        stencilLoadOp: 'clear',
        stencilStoreOp: 'store',
      },
    });

    this.setFrameBindGroups(renderPass);

    // Opaque first (state-sorted), then the HGRP outline hulls (depth-tested against the
    // opaque geometry), then the depth-biased iris overlays, then transparent
    // (back-to-front) on top of everything — the translucent eye-white shadow shell blends
    // over the iris. The stages bind their own pipeline/groups, so the transparent walk
    // starts from a fresh state cache.
    this.encode(renderPass, opaque, frameData, frame, {});
    this.deps.outlineStage.encode(renderPass, outline, frameData);
    this.deps.eyeOverlayStage.encode(renderPass, eyeOverlay, frameData);
    this.encode(renderPass, transparent, frameData, frame, {});

    renderPass.end();
  }

  /**
   * Set common bind groups that are shared across all renderables
   * Always sets all fixed bind groups to avoid WebGPU errors
   */
  private setFrameBindGroups(renderPass: GPURenderPassEncoder): void {
    // Group 0: Time bind group (always required)
    const timeBindGroup = this.deps.resourceManager.getBindGroupResource('timeBindGroup');
    if (!timeBindGroup) {
      throw new Error('Time bind group not found');
    }
    renderPass.setBindGroup(0, timeBindGroup.bindGroup);

    // Group 1: MVP bind group is set per draw instance during encode.
    // Groups 2 and 3: set per material during encode based on material family
    // - PMX materials: Group 2 = PMX material + textures, Group 3 = animation data
    // - Regular materials: Group 2 = textures, Group 3 = material
  }

  /**
   * Prepare phase: resolve pipeline, geometry, and material bind groups for every draw item.
   * All async work lives here; per-key resources are resolved once per frame via `frame`.
   */
  private async prepare(items: DrawItem[], frame: FrameResources): Promise<void> {
    for (const item of items) {
      const { renderable } = item;

      // PMX renderables carry the entity's component material at this point: the pipeline key
      // was derived from it in buildDrawLists, so the pipeline must be created from it too
      // (same order as the previous group-based flow; the processed PMX material only provides
      // bind groups below).
      let pipeline = frame.pipelines.get(item.pipelineKey);
      if (!pipeline) {
        pipeline = await this.deps.pipelineFactory.createAutoPipeline(
          renderable.material,
          renderable.geometryData,
        );
        frame.pipelines.set(item.pipelineKey, pipeline);
      }
      item.pipeline = pipeline;

      if (renderable.pmxAssetId && renderable.pmxComponent) {
        const materialIndex = renderable.materialIndex || 0;
        item.geometry = this.getOrCreatePMXGeometry(renderable, materialIndex);

        // Animation buffers are per PMX asset, shared by all of its material draws
        if (!frame.pmxAnimations.has(renderable.pmxAssetId)) {
          frame.pmxAnimations.set(
            renderable.pmxAssetId,
            await this.preparePMXAnimation(renderable),
          );
        }

        if (!frame.materials.has(renderable.materialKey)) {
          const assetDescriptor = renderable.pmxComponent.resolveAsset<'pmx_material'>();
          if (!assetDescriptor) {
            throw new Error('PMX asset not found');
          }
          const pmxMaterial = await this.deps.pmxMaterialProcessor.createPMXMaterial(
            renderable.materialKey,
            { assetDescriptor, materialIndex },
          );
          frame.materials.set(renderable.materialKey, {
            group2: pmxMaterial?.bindGroup,
            group3: frame.pmxAnimations.get(renderable.pmxAssetId),
          });
        }
      } else {
        item.geometry = this.deps.geometryManager.createGeometryFromData(
          renderable.geometryId || 'render_geometry',
          { geometryData: renderable.geometryData },
        );

        if (!frame.materials.has(renderable.materialKey)) {
          const bindings = await this.deps.materialBinder.ensureMaterialBindings(renderable);
          // Group 3 of HGRP pipelines is pass-level state (per-frame globals: prepass
          // depth), so the pass completes the binding plan here — the encode walk below
          // binds whatever prepare resolved, with no per-family knowledge.
          if (renderable.material.materialType === 'hgrp') {
            bindings.group3 = this.deps.getHGRPFrameBindGroup();
          }
          frame.materials.set(renderable.materialKey, bindings);
        }
      }
    }
  }

  /**
   * Encode phase: fully synchronous state-cached walk over one ordered draw list.
   */
  private encode(
    renderPass: GPURenderPassEncoder,
    items: DrawItem[],
    frameData: FrameData,
    frame: FrameResources,
    cache: EncodeStateCache,
  ): void {
    for (const item of items) {
      const renderable = item.renderable;
      const geometry = item.geometry!;

      if (item.pipelineKey !== cache.pipelineKey) {
        renderPass.setPipeline(item.pipeline!);
        cache.pipelineKey = item.pipelineKey;
      }

      if (renderable.materialKey !== cache.materialKey) {
        const bindings = frame.materials.get(renderable.materialKey);
        if (bindings?.group2) {
          renderPass.setBindGroup(2, bindings.group2);
        }
        if (bindings?.group3) {
          renderPass.setBindGroup(3, bindings.group3);
        }
        cache.materialKey = renderable.materialKey;
      }

      if (renderable.geometryId !== cache.geometryId) {
        renderPass.setVertexBuffer(0, geometry.vertexBuffer);
        renderPass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
        cache.geometryId = renderable.geometryId;
      }

      // uniformKey contract: equal key ⇒ identical matrices, so write and bind skip together
      if (renderable.uniformKey !== cache.uniformKey) {
        const mvpBindGroup = this.deps.mvpUniformManager.updateMVPUniforms(renderable, frameData);
        renderPass.setBindGroup(1, mvpBindGroup);
        cache.uniformKey = renderable.uniformKey;
      }

      renderPass.drawIndexed(geometry.indexCount);
    }
  }

  /**
   * Get or create geometry for PMX model from asset data.
   * PMX-specific resolution lives as pass privates until a second pass needs it shared.
   */
  private getOrCreatePMXGeometry(
    renderable: RenderData,
    materialIndex: number = 0,
  ): GeometryCacheItem {
    const { pmxAssetId, pmxComponent } = renderable;

    if (!pmxAssetId || !pmxComponent) {
      throw new Error('PMX asset ID or component not provided');
    }

    // Create a unique geometry ID for this material
    const geometryId = `${pmxAssetId}_material_geometry_${materialIndex}`;

    // Get asset data from registry
    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) {
      throw new Error(`PMX asset not found: ${pmxAssetId}`);
    }

    // Get PMX model data from asset descriptor
    const pmxModel = assetDescriptor.rawData as PMXModel;
    if (!pmxModel || !pmxModel.materials || !pmxModel.faces) {
      throw new Error('PMX model data not available');
    }

    // Create geometry for this specific material
    const geometry = this.deps.geometryManager.createPMXGeometry(
      geometryId,
      pmxModel,
      materialIndex,
    );

    if (!geometry) {
      throw new Error('Failed to create PMX geometry for material');
    }

    return geometry;
  }

  /**
   * Ensure PMX animation buffers exist and hold this frame's data; returns the animation
   * bind group (group 3). Buffers are keyed per PMX asset.
   */
  private async preparePMXAnimation(renderable: RenderData): Promise<GPUBindGroup | undefined> {
    if (!renderable.pmxAssetId) return undefined;

    // Get or create animation buffers for this PMX model
    const pmxComponent = renderable.pmxComponent;
    if (!pmxComponent) return undefined;

    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) return undefined;

    const pmxModel = assetDescriptor.rawData as PMXModel; // PMXModel type
    if (!pmxModel) return undefined;

    // Get bone count, vertex count, and morph count from PMX model
    const boneCount = pmxModel.bones?.length || 0;
    const vertexCount = pmxModel.vertices?.length || 0;
    const morphCount = renderable.morphCount || pmxModel.morphs?.length || 0;

    // Get or create animation buffers
    const animationBuffers = this.deps.pmxAnimationBufferManager.getOrCreateAnimationBuffers(
      renderable.pmxAssetId,
      boneCount,
      vertexCount,
      morphCount,
    );

    // Update animation data if needed
    this.updatePMXAnimationData(renderable);

    return animationBuffers.animationBindGroup;
  }

  /**
   * Update PMX animation data for a specific model
   */
  private updatePMXAnimationData(renderable: RenderData): void {
    const { pmxAssetId, boneMatrices, morphWeights, morphCount = 64 } = renderable;
    if (!pmxAssetId) return;

    // Update buffers
    if (boneMatrices) {
      this.deps.pmxAnimationBufferManager.updateBoneMatrices(pmxAssetId, boneMatrices);
    }
    if (morphWeights) {
      this.deps.pmxAnimationBufferManager.updateMorphWeights(pmxAssetId, morphCount, morphWeights);
    }

    // Only update morph data if it's provided (it's static and large)
    // if (morphData) {
    //   this.pmxAnimationBufferManager.updateMorphData(pmxAssetId, morphData);
    // }
  }
}
