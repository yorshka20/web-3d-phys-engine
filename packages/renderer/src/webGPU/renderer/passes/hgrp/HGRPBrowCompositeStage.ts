import { FrameData } from '../../../../frame/types';
import { HGRPMaterialDescriptor } from '../../../../material/hgrp';
import { BindGroupManager } from '../../../core/BindGroupManager';
import { GeometryManager } from '../../../core/GeometryManager';
import {
  getOrCreateHGRPFrameBindGroupLayout,
  getOrCreateHGRPMaterialBindGroupLayout,
} from '../../../core/HGRPMaterialResources';
import { MaterialBinder } from '../../../core/MaterialBinder';
import { MVPUniformManager } from '../../../core/MVPUniformManager';
import { createGltfVertexBufferLayout } from '../../../core/pipeline/vertexLayouts';
import { hgrpPassShaderId } from '../../../core/shaders/create';
import { ShaderManager } from '../../../core/shaders/ShaderManager';
import { Inject, ServiceTokens } from '../../../core/decorators';
import { WebGPUContext } from '../../../core/WebGPUContext';
import { DrawItem } from '../../frame/DrawListBuilder';
import { HGRPFrameGlobals } from './types';

/**
 * HGRP Brow Composite Stage (brow shows through the bangs)
 *
 * Two draws inside the forward pass, after the opaque/outline/eye walks:
 * 1. Hair stencil mark — the hair geometry again, depth-equal, color writes off, stamping
 *    _HairStencilRef where the sw_M mask exceeds its threshold (the region the hair permits
 *    the brow to show through; per-fragment masking is a discard in the shader).
 * 2. Brow through-overlay — the brow geometry where it is OCCLUDED (depth compare greater)
 *    AND the stencil matches the mark, alpha-blended at a fixed opacity.
 *
 * Stencil states are not expressible in the semantic pipeline key, so both pipelines are
 * pass-private (same rule as the outline/eye stages), one per material permutation met: the
 * shaders and group-2 layouts follow the hair's and the brow's permutations. Renderer-private,
 * constructor-wired.
 */
export class HGRPBrowCompositeStage {
  private markPipelines = new Map<string, GPURenderPipeline>();
  private throughPipelines = new Map<string, GPURenderPipeline>();
  private frameBindings = new Map<string, GPUBindGroup | undefined>();

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
  @Inject(ServiceTokens.WEBGPU_CONTEXT) private accessor context!: WebGPUContext;
  @Inject(ServiceTokens.SHADER_MANAGER) private accessor shaderManager!: ShaderManager;
  @Inject(ServiceTokens.BIND_GROUP_MANAGER) private accessor bindGroupManager!: BindGroupManager;
  @Inject(ServiceTokens.MATERIAL_BINDER) private accessor materialBinder!: MaterialBinder;
  @Inject(ServiceTokens.MVP_UNIFORM_MANAGER) private accessor mvpUniformManager!: MVPUniformManager;
  @Inject(ServiceTokens.GEOMETRY_MANAGER) private accessor geometryManager!: GeometryManager;

  constructor(private readonly globals: HGRPFrameGlobals) {}

  async prepare(hairItems: DrawItem[], browItems: DrawItem[]): Promise<void> {
    this.frameBindings.clear();
    if (hairItems.length === 0 || browItems.length === 0) {
      return;
    }

    for (const item of hairItems) {
      item.pipeline = this.ensureMarkPipeline(item.renderable.material as HGRPMaterialDescriptor);
    }
    for (const item of browItems) {
      item.pipeline = this.ensureThroughPipeline(
        item.renderable.material as HGRPMaterialDescriptor,
      );
    }
    for (const item of [...hairItems, ...browItems]) {
      const { renderable } = item;
      item.geometry = this.geometryManager.createGeometryFromData(renderable.geometryId, {
        geometryData: renderable.geometryData,
      });
      if (!this.frameBindings.has(renderable.materialKey)) {
        const bindings = await this.materialBinder.ensureMaterialBindings(renderable);
        this.frameBindings.set(renderable.materialKey, bindings.group2);
      }
    }
  }

  /**
   * Encode both draws. Runs after the eye overlay and before transparent; the caller's
   * encode-state cache is invalid afterwards. The stencil reference stays at the hair ref —
   * harmless, later pipelines keep the default always/keep stencil state.
   */
  encode(
    renderPass: GPURenderPassEncoder,
    hairItems: DrawItem[],
    browItems: DrawItem[],
    frameData: FrameData,
  ): void {
    if (hairItems.length === 0 || browItems.length === 0) {
      return;
    }

    const stencilRef =
      (hairItems[0].renderable.material as HGRPMaterialDescriptor).floats._HairStencilRef ?? 36;

    renderPass.setStencilReference(stencilRef);
    this.walk(renderPass, hairItems, frameData);

    renderPass.setBindGroup(3, this.globals.getFrameBindGroup());
    this.walk(renderPass, browItems, frameData);
  }

  private walk(renderPass: GPURenderPassEncoder, items: DrawItem[], frameData: FrameData): void {
    let boundPipeline: GPURenderPipeline | undefined;
    let boundMaterialKey: string | undefined;
    let boundGeometryId: string | undefined;
    let boundUniformKey: string | undefined;

    for (const item of items) {
      const { renderable } = item;
      const geometry = item.geometry!;

      if (item.pipeline !== boundPipeline) {
        renderPass.setPipeline(item.pipeline!);
        boundPipeline = item.pipeline;
      }
      if (renderable.materialKey !== boundMaterialKey) {
        const bindGroup = this.frameBindings.get(renderable.materialKey);
        if (bindGroup) {
          renderPass.setBindGroup(2, bindGroup);
        }
        boundMaterialKey = renderable.materialKey;
      }
      if (renderable.uniformKey !== boundUniformKey) {
        const mvpBindGroup = this.mvpUniformManager.updateMVPUniforms(renderable, frameData);
        renderPass.setBindGroup(1, mvpBindGroup);
        boundUniformKey = renderable.uniformKey;
      }
      if (renderable.geometryId !== boundGeometryId) {
        renderPass.setVertexBuffer(0, geometry.vertexBuffer);
        renderPass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
        boundGeometryId = renderable.geometryId;
      }
      renderPass.drawIndexed(geometry.indexCount);
    }
  }

  private commonLayouts(): { time: GPUBindGroupLayout; mvp: GPUBindGroupLayout } {
    const time = this.bindGroupManager.getBindGroupLayout('timeBindGroupLayout');
    const mvp = this.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!time || !mvp) {
      throw new Error('Time/MVP bind group layouts not found for the brow composite stage');
    }
    return { time, mvp };
  }

  private ensureMarkPipeline(hair: HGRPMaterialDescriptor): GPURenderPipeline {
    const shaderId = hgrpPassShaderId('hairStencil', hair.permutation);
    const existing = this.markPipelines.get(shaderId);
    if (existing) {
      return existing;
    }

    const { time, mvp } = this.commonLayouts();
    const hairLayout = getOrCreateHGRPMaterialBindGroupLayout(
      this.bindGroupManager,
      hair.permutation,
    );
    const markModule = this.shaderManager.getShaderModule(shaderId);

    const pipeline = this.device.createRenderPipeline({
      label: `hgrp_hair_stencil_pipeline:${shaderId}`,
      layout: this.device.createPipelineLayout({
        label: `hgrp_hair_stencil_pipeline_layout:${shaderId}`,
        bindGroupLayouts: [time, mvp, hairLayout],
      }),
      vertex: {
        module: markModule,
        entryPoint: 'vs_main',
        buffers: [createGltfVertexBufferLayout()],
      },
      fragment: {
        module: markModule,
        entryPoint: 'fs_main',
        // Stencil-only draw: the color target exists to match the pass, writes masked off
        targets: [{ format: this.context.getSceneColorFormat(), writeMask: 0 }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: {
        format: this.context.getDepthStencilFormat(),
        depthWriteEnabled: false,
        // Equal to the hair's own opaque depth (identical vertex math via the shared
        // hgrp_vertex include); less-equal absorbs precision noise
        depthCompare: 'less-equal',
        stencilFront: { compare: 'always', passOp: 'replace' },
        stencilBack: { compare: 'always', passOp: 'replace' },
      },
    });
    this.markPipelines.set(shaderId, pipeline);
    return pipeline;
  }

  private ensureThroughPipeline(brow: HGRPMaterialDescriptor): GPURenderPipeline {
    const shaderId = hgrpPassShaderId('browThrough', brow.permutation);
    const existing = this.throughPipelines.get(shaderId);
    if (existing) {
      return existing;
    }

    const { time, mvp } = this.commonLayouts();
    const eyeLayout = getOrCreateHGRPMaterialBindGroupLayout(
      this.bindGroupManager,
      brow.permutation,
    );
    const frameLayout = getOrCreateHGRPFrameBindGroupLayout(this.bindGroupManager);
    const throughModule = this.shaderManager.getShaderModule(shaderId);

    const pipeline = this.device.createRenderPipeline({
      label: `hgrp_brow_through_pipeline:${shaderId}`,
      layout: this.device.createPipelineLayout({
        label: `hgrp_brow_through_pipeline_layout:${shaderId}`,
        bindGroupLayouts: [time, mvp, eyeLayout, frameLayout],
      }),
      vertex: {
        module: throughModule,
        entryPoint: 'vs_main',
        buffers: [createGltfVertexBufferLayout()],
      },
      fragment: {
        module: throughModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.context.getSceneColorFormat(),
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: {
        format: this.context.getDepthStencilFormat(),
        depthWriteEnabled: false,
        // Only where the brow is OCCLUDED and the hair mark matches
        depthCompare: 'greater',
        stencilFront: { compare: 'equal' },
        stencilBack: { compare: 'equal' },
      },
    });
    this.throughPipelines.set(shaderId, pipeline);
    return pipeline;
  }
}
