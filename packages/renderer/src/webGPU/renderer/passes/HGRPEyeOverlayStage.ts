import { FrameData } from '@renderer/frame/types';
import { BindGroupManager } from '../../core/BindGroupManager';
import { GeometryManager } from '../../core/GeometryManager';
import { getOrCreateHGRPMaterialBindGroupLayout } from '../../core/HGRPMaterialResources';
import { MaterialBinder } from '../../core/MaterialBinder';
import { MVPUniformManager } from '../../core/MVPUniformManager';
import { createGltfVertexBufferLayout } from '../../core/pipeline/vertexLayouts';
import { ShaderManager } from '../../core/shaders/ShaderManager';
import { DrawItem } from '../frame/DrawListBuilder';

export interface HGRPEyeOverlayStageDeps {
  device: GPUDevice;
  shaderManager: ShaderManager;
  bindGroupManager: BindGroupManager;
  materialBinder: MaterialBinder;
  mvpUniformManager: MVPUniformManager;
  geometryManager: GeometryManager;
  sceneColorFormat: GPUTextureFormat;
  depthStencilFormat: GPUTextureFormat;
}

/**
 * HGRP Eye Overlay Stage
 *
 * Draws the iris, which sits behind the face's eye-white surface. The overlay shader
 * (passes/hgrp_eye_overlay.wgsl) pulls the projected position slightly toward the camera,
 * so the iris wins the depth test against the eye-white millimetres in front of it but
 * still loses to the cheek/hair centimetres in front at grazing angles — the game's pre-Z
 * stencil compositing achieves the same gating, but its writer semantics did not survive
 * the rip (and the eye-white shadow shell only covers the upper eye, so it cannot stamp
 * the opening; probed 2026-09-01).
 *
 * Fragment shading is the shared Eye-variant path with the regular variant bind groups;
 * only the vertex projection and depth-write state differ, which the semantic pipeline key
 * cannot express — so the pipeline is pass-private (same rule as HGRPOutlineStage).
 */
export class HGRPEyeOverlayStage {
  private pipeline?: GPURenderPipeline;
  private frameBindings = new Map<string, GPUBindGroup | undefined>();

  constructor(private readonly deps: HGRPEyeOverlayStageDeps) {}

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
        const bindings = await this.deps.materialBinder.ensureMaterialBindings(renderable);
        this.frameBindings.set(renderable.materialKey, bindings.group2);
      }
    }
  }

  /**
   * Encode the overlay draws. Runs after the opaque/outline walks and before transparent
   * (the translucent eye-white shadow shell blends on top); the caller's encode-state cache
   * is invalid afterwards.
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
        const bindGroup = this.frameBindings.get(renderable.materialKey);
        if (bindGroup) {
          renderPass.setBindGroup(2, bindGroup);
        }
        boundMaterialKey = renderable.materialKey;
      }
      if (renderable.geometryId !== boundGeometryId) {
        renderPass.setVertexBuffer(0, geometry.vertexBuffer);
        renderPass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
        boundGeometryId = renderable.geometryId;
      }
      if (renderable.uniformKey !== boundUniformKey) {
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

    const shaderModule = this.deps.shaderManager.getShaderModule('hgrp_eye_overlay_shader');
    if (!shaderModule) {
      throw new Error('HGRP eye overlay shader module not compiled');
    }

    const timeLayout = this.deps.bindGroupManager.getBindGroupLayout('timeBindGroupLayout');
    const mvpLayout = this.deps.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!timeLayout || !mvpLayout) {
      throw new Error('Time/MVP bind group layouts not found for the eye overlay pipeline');
    }
    const eyeLayout = getOrCreateHGRPMaterialBindGroupLayout(
      this.deps.bindGroupManager,
      'CharacterNPR_Eye',
    );

    this.pipeline = this.deps.device.createRenderPipeline({
      label: 'hgrp_eye_overlay_pipeline',
      layout: this.deps.device.createPipelineLayout({
        label: 'hgrp_eye_overlay_pipeline_layout',
        bindGroupLayouts: [timeLayout, mvpLayout, eyeLayout],
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
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: {
        format: this.deps.depthStencilFormat,
        // Depth-tested against the real scene; the biased projection provides the gating.
        // No depth write: the biased depths must not pollute the buffer.
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
    });
  }
}
