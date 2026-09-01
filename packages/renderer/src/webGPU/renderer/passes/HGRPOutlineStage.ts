import { FrameData } from '@renderer/frame/types';
import { BindGroupManager } from '../../core/BindGroupManager';
import { GeometryManager } from '../../core/GeometryManager';
import { getOrCreateHGRPOutlineBindGroupLayout } from '../../core/HGRPMaterialResources';
import { MaterialBinder } from '../../core/MaterialBinder';
import { MVPUniformManager } from '../../core/MVPUniformManager';
import { createGltfVertexBufferLayout } from '../../core/pipeline/vertexLayouts';
import { ShaderManager } from '../../core/shaders/ShaderManager';
import { DrawItem } from '../frame/DrawListBuilder';

export interface HGRPOutlineStageDeps {
  device: GPUDevice;
  shaderManager: ShaderManager;
  bindGroupManager: BindGroupManager;
  materialBinder: MaterialBinder;
  mvpUniformManager: MVPUniformManager;
  geometryManager: GeometryManager;
  sceneColorFormat: GPUTextureFormat;
}

/**
 * HGRP Outline Stage
 *
 * Draws the inverted-hull outline list inside the forward render pass (same attachments, so
 * this is a draw stage of ForwardPass, not a render pass of its own). Exactly one pipeline:
 * front-face culling cannot be expressed through the semantic pipeline key, so the pipeline
 * is built here directly from the compiled outline shader; per-material state is just the
 * outline bind group (material uniform + base map) resolved by MaterialBinder.
 */
export class HGRPOutlineStage {
  private pipeline?: GPURenderPipeline;
  private frameBindings = new Map<string, GPUBindGroup>();

  constructor(private readonly deps: HGRPOutlineStageDeps) {}

  async prepare(items: DrawItem[]): Promise<void> {
    this.frameBindings.clear();
    if (items.length === 0) {
      return;
    }
    this.ensurePipeline();

    for (const item of items) {
      const { renderable } = item;
      item.geometry = this.deps.geometryManager.createGeometryFromData(renderable.geometryId, {
        geometryData: renderable.geometryData,
      });
      if (!this.frameBindings.has(renderable.materialKey)) {
        this.frameBindings.set(
          renderable.materialKey,
          await this.deps.materialBinder.ensureHGRPOutlineBindGroup(renderable),
        );
      }
    }
  }

  /**
   * Encode the outline draws. Runs between the opaque and transparent walks; the caller's
   * encode-state cache is invalid afterwards (this stage binds its own pipeline/groups).
   */
  encode(renderPass: GPURenderPassEncoder, items: DrawItem[], frameData: FrameData): void {
    if (items.length === 0 || !this.pipeline) {
      return;
    }

    renderPass.setPipeline(this.pipeline);

    let boundMaterialKey: string | undefined;
    let boundGeometryId: string | undefined;
    let boundUniformKey: string | undefined;

    for (const item of items) {
      const { renderable } = item;
      const geometry = item.geometry!;

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
        const mvpBindGroup = this.deps.mvpUniformManager.updateMVPUniforms(renderable, frameData);
        renderPass.setBindGroup(1, mvpBindGroup);
        boundUniformKey = renderable.uniformKey;
      }

      renderPass.drawIndexed(geometry.indexCount);
    }
  }

  private ensurePipeline(): void {
    if (this.pipeline) {
      return;
    }

    const shaderModule = this.deps.shaderManager.getShaderModule('hgrp_outline_shader');
    if (!shaderModule) {
      throw new Error('HGRP outline shader module not compiled');
    }

    const timeLayout = this.deps.bindGroupManager.getBindGroupLayout('timeBindGroupLayout');
    const mvpLayout = this.deps.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!timeLayout || !mvpLayout) {
      throw new Error('Time/MVP bind group layouts not found for the outline pipeline');
    }
    const outlineLayout = getOrCreateHGRPOutlineBindGroupLayout(this.deps.bindGroupManager);

    this.pipeline = this.deps.device.createRenderPipeline({
      label: 'hgrp_outline_pipeline',
      layout: this.deps.device.createPipelineLayout({
        label: 'hgrp_outline_pipeline_layout',
        bindGroupLayouts: [timeLayout, mvpLayout, outlineLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [createGltfVertexBufferLayout()],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.deps.sceneColorFormat }],
      },
      // Inverted hull: cull the front faces so only the extruded back-facing shell shows
      primitive: { topology: 'triangle-list', cullMode: 'front', frontFace: 'ccw' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });
  }
}
