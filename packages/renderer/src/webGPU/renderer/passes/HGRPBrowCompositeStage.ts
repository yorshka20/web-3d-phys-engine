import { FrameData } from '@renderer/frame/types';
import { HGRPMaterialDescriptor } from '@renderer/material/hgrp';
import { BindGroupManager } from '../../core/BindGroupManager';
import { GeometryManager } from '../../core/GeometryManager';
import {
  getOrCreateHGRPFrameBindGroupLayout,
  getOrCreateHGRPMaterialBindGroupLayout,
} from '../../core/HGRPMaterialResources';
import { MaterialBinder } from '../../core/MaterialBinder';
import { MVPUniformManager } from '../../core/MVPUniformManager';
import { createGltfVertexBufferLayout } from '../../core/pipeline/vertexLayouts';
import { ShaderManager } from '../../core/shaders/ShaderManager';
import { DrawItem } from '../frame/DrawListBuilder';

export interface HGRPBrowCompositeStageDeps {
  device: GPUDevice;
  shaderManager: ShaderManager;
  bindGroupManager: BindGroupManager;
  materialBinder: MaterialBinder;
  mvpUniformManager: MVPUniformManager;
  geometryManager: GeometryManager;
  sceneColorFormat: GPUTextureFormat;
  depthStencilFormat: GPUTextureFormat;
  getFrameBindGroup(): GPUBindGroup;
}

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
 * pass-private (same rule as the outline/eye stages). Renderer-private, constructor-wired.
 */
export class HGRPBrowCompositeStage {
  private markPipeline?: GPURenderPipeline;
  private throughPipeline?: GPURenderPipeline;
  private frameBindings = new Map<string, GPUBindGroup | undefined>();

  constructor(private readonly deps: HGRPBrowCompositeStageDeps) {}

  async prepare(hairItems: DrawItem[], browItems: DrawItem[]): Promise<void> {
    this.frameBindings.clear();
    if (hairItems.length === 0 || browItems.length === 0) {
      return;
    }
    this.ensurePipelines();

    for (const item of [...hairItems, ...browItems]) {
      const { renderable } = item;
      item.geometry = this.deps.geometryManager.createGeometryFromData(renderable.geometryId, {
        geometryData: renderable.geometryData,
      });
      if (!this.frameBindings.has(renderable.materialKey)) {
        const bindings = await this.deps.materialBinder.ensureMaterialBindings(renderable);
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
    if (hairItems.length === 0 || browItems.length === 0 || !this.markPipeline) {
      return;
    }

    const stencilRef =
      (hairItems[0].renderable.material as HGRPMaterialDescriptor).floats._HairStencilRef ?? 36;

    renderPass.setPipeline(this.markPipeline);
    renderPass.setStencilReference(stencilRef);
    this.walk(renderPass, hairItems, frameData);

    renderPass.setPipeline(this.throughPipeline!);
    renderPass.setBindGroup(3, this.deps.getFrameBindGroup());
    this.walk(renderPass, browItems, frameData);
  }

  private walk(renderPass: GPURenderPassEncoder, items: DrawItem[], frameData: FrameData): void {
    let boundMaterialKey: string | undefined;
    let boundGeometryId: string | undefined;
    let boundUniformKey: string | undefined;

    for (const item of items) {
      const { renderable } = item;
      const geometry = item.geometry!;

      if (renderable.materialKey !== boundMaterialKey) {
        const bindGroup = this.frameBindings.get(renderable.materialKey);
        if (bindGroup) {
          renderPass.setBindGroup(2, bindGroup);
        }
        boundMaterialKey = renderable.materialKey;
      }
      if (renderable.uniformKey !== boundUniformKey) {
        const mvpBindGroup = this.deps.mvpUniformManager.updateMVPUniforms(renderable, frameData);
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

  private ensurePipelines(): void {
    if (this.markPipeline) {
      return;
    }

    const timeLayout = this.deps.bindGroupManager.getBindGroupLayout('timeBindGroupLayout');
    const mvpLayout = this.deps.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!timeLayout || !mvpLayout) {
      throw new Error('Time/MVP bind group layouts not found for the brow composite stage');
    }
    const hairLayout = getOrCreateHGRPMaterialBindGroupLayout(
      this.deps.bindGroupManager,
      'CharacterNPR_Hair',
    );
    const eyeLayout = getOrCreateHGRPMaterialBindGroupLayout(
      this.deps.bindGroupManager,
      'CharacterNPR_Eye',
    );
    const frameLayout = getOrCreateHGRPFrameBindGroupLayout(this.deps.bindGroupManager);

    const markModule = this.deps.shaderManager.getShaderModule('hgrp_hair_stencil_shader');
    const throughModule = this.deps.shaderManager.getShaderModule('hgrp_brow_through_shader');
    if (!markModule || !throughModule) {
      throw new Error('HGRP brow compositing shader modules not compiled');
    }

    this.markPipeline = this.deps.device.createRenderPipeline({
      label: 'hgrp_hair_stencil_pipeline',
      layout: this.deps.device.createPipelineLayout({
        label: 'hgrp_hair_stencil_pipeline_layout',
        bindGroupLayouts: [timeLayout, mvpLayout, hairLayout],
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
        targets: [{ format: this.deps.sceneColorFormat, writeMask: 0 }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: {
        format: this.deps.depthStencilFormat,
        depthWriteEnabled: false,
        // Equal to the hair's own opaque depth (identical vertex math via the shared
        // hgrp_vertex include); less-equal absorbs precision noise
        depthCompare: 'less-equal',
        stencilFront: { compare: 'always', passOp: 'replace' },
        stencilBack: { compare: 'always', passOp: 'replace' },
      },
    });

    this.throughPipeline = this.deps.device.createRenderPipeline({
      label: 'hgrp_brow_through_pipeline',
      layout: this.deps.device.createPipelineLayout({
        label: 'hgrp_brow_through_pipeline_layout',
        bindGroupLayouts: [timeLayout, mvpLayout, eyeLayout, frameLayout],
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
            format: this.deps.sceneColorFormat,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: {
        format: this.deps.depthStencilFormat,
        depthWriteEnabled: false,
        // Only where the brow is OCCLUDED and the hair mark matches
        depthCompare: 'greater',
        stencilFront: { compare: 'equal' },
        stencilBack: { compare: 'equal' },
      },
    });
  }
}
