import { FrameData } from '../../../../frame/types';
import { BindGroupManager } from '../../../core/BindGroupManager';
import { GeometryManager } from '../../../core/GeometryManager';
import {
  getOrCreateHGRPFrameBindGroupLayout,
  getOrCreateHGRPOutlineBindGroupLayout,
} from '../../../core/HGRPMaterialResources';
import type { HGRPFrameGlobals } from './types';
import { MaterialBinder } from '../../../core/MaterialBinder';
import { MVPUniformManager } from '../../../core/MVPUniformManager';
import { createGltfVertexBufferLayout } from '../../../core/pipeline/vertexLayouts';
import { ShaderManager } from '../../../core/shaders/ShaderManager';
import { HGRP_STENCIL_EYE_BIT, HGRPMaterialDescriptor } from '../../../../material/hgrp';
import { Inject, ServiceTokens } from '../../../core/decorators';
import { WebGPUContext } from '../../../core/WebGPUContext';
import { DrawItem } from '../../frame/DrawListBuilder';

/**
 * Depth comparison of one material's outline hull, from `_OutlineZTest`.
 *
 * The preset carries a Unity CompareFunction: 0 Disabled, 1 Never, 2 Less, 3 Equal,
 * 4 LEqual, 5 Greater, 6 NotEqual, 7 GEqual, 8 Always.
 *
 * **Equal is deliberately not copied literally.** Across the six converted characters the
 * only values that occur are 4 (22 materials) and 3 (6 materials, every character's hair but
 * Pelica's). In HGRP, Equal pairs with a PreZ pass that has already laid the hull's own depth
 * down, so the color pass shades exactly the fragments the prepass kept. This renderer draws
 * the hull once and never writes its depth beforehand, so Equal would reject the entire shell
 * and the hair outline would vanish. The faithful translation of "the fragments the prepass
 * would have kept" into a single-pass structure is "the fragments that pass the depth test",
 * which is LEqual. Recorded as a deviation in learnings hgrp-guess-ledger.md.
 */
function outlineDepthCompare(material: HGRPMaterialDescriptor | undefined): GPUCompareFunction {
  switch (material?.floats._OutlineZTest) {
    case 1:
      return 'never';
    case 2:
      return 'less';
    case 5:
      return 'greater';
    case 6:
      return 'not-equal';
    case 7:
      return 'greater-equal';
    case 0:
    case 8:
      return 'always';
    // 3 (Equal, see above) and 4 (LEqual), plus the absent case: the preset's dominant value
    default:
      return 'less-equal';
  }
}

/**
 * The hair's hull, like the hair itself, skips every pixel the eye group stamped (the game's
 * CharacterOutline pass on hair: Ref 16, ReadMask 16, NotEqual — formulas §5), so no stroke
 * runs across a brow or an iris showing through the bangs. Other hulls use the pass default.
 */
function isHairHull(material: HGRPMaterialDescriptor | undefined): boolean {
  return material?.variant === 'CharacterNPR_Hair';
}

const HAIR_HULL_STENCIL: Partial<GPUDepthStencilState> = {
  stencilFront: { compare: 'not-equal' },
  stencilBack: { compare: 'not-equal' },
  stencilReadMask: HGRP_STENCIL_EYE_BIT,
};

/**
 * HGRP Outline Stage
 *
 * Draws the inverted-hull outline lists inside the forward render pass (same attachments, so
 * this is a draw stage of ForwardPass, not a render pass of its own). The pipelines are built
 * here rather than through the semantic pipeline key, which cannot express front-face culling;
 * per-material state is the outline bind group (material uniform + base map + masks) resolved
 * by MaterialBinder, plus the depth comparison the material's _OutlineZTest asks for and the
 * hair hull's stencil yield.
 */
export class HGRPOutlineStage {
  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
  @Inject(ServiceTokens.WEBGPU_CONTEXT) private accessor context!: WebGPUContext;
  @Inject(ServiceTokens.SHADER_MANAGER) private accessor shaderManager!: ShaderManager;
  @Inject(ServiceTokens.BIND_GROUP_MANAGER) private accessor bindGroupManager!: BindGroupManager;
  @Inject(ServiceTokens.MATERIAL_BINDER) private accessor materialBinder!: MaterialBinder;
  @Inject(ServiceTokens.MVP_UNIFORM_MANAGER) private accessor mvpUniformManager!: MVPUniformManager;
  @Inject(ServiceTokens.GEOMETRY_MANAGER) private accessor geometryManager!: GeometryManager;

  // One pipeline per distinct (depth comparison, hair yield) the frame's materials ask for.
  // The whole current roster collapses to two entries; the map exists so a preset value
  // outside that set lands on its own pipeline instead of being silently rendered wrong.
  private pipelines = new Map<string, GPURenderPipeline>();
  private frameBindings = new Map<string, GPUBindGroup>();

  // The frame group carries the prepass depth (its size is the half-pixel floor of the stroke
  // width) and the scene lighting the stroke color is lit with.
  constructor(private readonly globals: HGRPFrameGlobals) {}

  async prepare(items: DrawItem[]): Promise<void> {
    this.frameBindings.clear();
    if (items.length === 0) {
      return;
    }
    for (const item of items) {
      const { renderable } = item;
      const material = hgrpMaterialOf(renderable.material);
      item.pipeline = this.ensurePipeline(outlineDepthCompare(material), isHairHull(material));
      item.geometry = this.geometryManager.createGeometryFromData(renderable.geometryId, {
        geometryData: renderable.geometryData,
      });
      if (!this.frameBindings.has(renderable.materialKey)) {
        this.frameBindings.set(
          renderable.materialKey,
          await this.materialBinder.ensureHGRPOutlineBindGroup(renderable),
        );
      }
    }
  }

  /**
   * Encode one hull list. Called twice per frame — the opaque materials' hulls between the
   * opaque and transparent walks, the blend materials' after the transparent walk (each hull
   * needs its own object's depth already down; see DrawLists.transparentOutline). The caller's
   * encode-state cache is invalid afterwards, since this stage binds its own pipeline/groups
   * and stencil reference.
   */
  encode(renderPass: GPURenderPassEncoder, items: DrawItem[], frameData: FrameData): void {
    if (items.length === 0) {
      return;
    }

    let boundPipeline: GPURenderPipeline | undefined;
    let boundMaterialKey: string | undefined;
    let boundGeometryId: string | undefined;
    let boundUniformKey: string | undefined;
    renderPass.setBindGroup(3, this.globals.getFrameBindGroup());
    // Only the hair hull tests the stencil, against the eye bit
    renderPass.setStencilReference(HGRP_STENCIL_EYE_BIT);

    for (const item of items) {
      const { renderable } = item;
      const geometry = item.geometry!;

      if (item.pipeline !== boundPipeline) {
        renderPass.setPipeline(item.pipeline!);
        boundPipeline = item.pipeline;
      }
      if (renderable.materialKey !== boundMaterialKey) {
        renderPass.setBindGroup(2, this.frameBindings.get(renderable.materialKey)!);
        boundMaterialKey = renderable.materialKey;
      }
      if (renderable.geometryId !== boundGeometryId) {
        renderPass.setVertexBuffer(0, geometry.vertexBuffer);
        renderPass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
        boundGeometryId = renderable.geometryId;
      }
      if (renderable.uniformKey !== boundUniformKey) {
        // Same uniformKey as the base draw: updateMVPUniforms rewrites identical values
        // (allowed by the uniformKey contract) and returns the shared bind group.
        const mvpBindGroup = this.mvpUniformManager.updateMVPUniforms(renderable, frameData);
        renderPass.setBindGroup(1, mvpBindGroup);
        boundUniformKey = renderable.uniformKey;
      }

      renderPass.drawIndexed(geometry.indexCount);
    }
  }

  private ensurePipeline(depthCompare: GPUCompareFunction, hairHull: boolean): GPURenderPipeline {
    const key = `${depthCompare}:${hairHull ? 'hair' : 'body'}`;
    const cached = this.pipelines.get(key);
    if (cached) {
      return cached;
    }

    const shaderModule = this.shaderManager.getShaderModule('hgrp_outline_shader');
    if (!shaderModule) {
      throw new Error('HGRP outline shader module not compiled');
    }

    const timeLayout = this.bindGroupManager.getBindGroupLayout('timeBindGroupLayout');
    const mvpLayout = this.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!timeLayout || !mvpLayout) {
      throw new Error('Time/MVP bind group layouts not found for the outline pipeline');
    }
    const outlineLayout = getOrCreateHGRPOutlineBindGroupLayout(this.bindGroupManager);
    const frameLayout = getOrCreateHGRPFrameBindGroupLayout(this.bindGroupManager);

    const pipeline = this.device.createRenderPipeline({
      label: `hgrp_outline_pipeline_${key}`,
      layout: this.device.createPipelineLayout({
        label: 'hgrp_outline_pipeline_layout',
        bindGroupLayouts: [timeLayout, mvpLayout, outlineLayout, frameLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [createGltfVertexBufferLayout()],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.context.getSceneColorFormat() }],
      },
      // Inverted hull: cull the front faces so only the extruded back-facing shell shows
      primitive: { topology: 'triangle-list', cullMode: 'front', frontFace: 'ccw' },
      depthStencil: {
        format: this.context.getDepthStencilFormat(),
        depthWriteEnabled: true,
        depthCompare,
        ...(hairHull ? HAIR_HULL_STENCIL : {}),
      },
    });
    this.pipelines.set(key, pipeline);
    return pipeline;
  }
}

function hgrpMaterialOf(
  material: DrawItem['renderable']['material'],
): HGRPMaterialDescriptor | undefined {
  return material.materialType === 'hgrp' ? (material as HGRPMaterialDescriptor) : undefined;
}
