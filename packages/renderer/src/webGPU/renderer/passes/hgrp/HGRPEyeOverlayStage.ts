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
 * cannot express — so the pipelines are pass-private (same rule as HGRPOutlineStage), one
 * per Eye permutation met (the shader and the group-2 layout follow the material's
 * permutation, so an iris with a matcap and a brow with a LUT are two pipelines).
 */
export class HGRPEyeOverlayStage {
  private pipelines = new Map<string, GPURenderPipeline>();
  private frameBindings = new Map<string, GPUBindGroup | undefined>();

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
  @Inject(ServiceTokens.WEBGPU_CONTEXT) private accessor context!: WebGPUContext;
  @Inject(ServiceTokens.SHADER_MANAGER) private accessor shaderManager!: ShaderManager;
  @Inject(ServiceTokens.BIND_GROUP_MANAGER) private accessor bindGroupManager!: BindGroupManager;
  @Inject(ServiceTokens.MATERIAL_BINDER) private accessor materialBinder!: MaterialBinder;
  @Inject(ServiceTokens.MVP_UNIFORM_MANAGER) private accessor mvpUniformManager!: MVPUniformManager;
  @Inject(ServiceTokens.GEOMETRY_MANAGER) private accessor geometryManager!: GeometryManager;

  constructor(private readonly globals: HGRPFrameGlobals) {}

  async prepare(items: DrawItem[]): Promise<void> {
    this.frameBindings.clear();

    for (const item of items) {
      const { renderable } = item;
      item.pipeline = this.ensurePipeline(renderable.material as HGRPMaterialDescriptor);
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
   * Encode the overlay draws. Runs after the opaque/outline walks and before transparent
   * (the translucent eye-white shadow shell blends on top); the caller's encode-state cache
   * is invalid afterwards. Items arrive sorted by materialKey, so pipeline switches are
   * bounded by the number of materials.
   */
  encode(renderPass: GPURenderPassEncoder, items: DrawItem[], frameData: FrameData): void {
    if (items.length === 0) {
      return;
    }

    renderPass.setBindGroup(3, this.globals.getFrameBindGroup());

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
      if (renderable.geometryId !== boundGeometryId) {
        renderPass.setVertexBuffer(0, geometry.vertexBuffer);
        renderPass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
        boundGeometryId = renderable.geometryId;
      }
      if (renderable.uniformKey !== boundUniformKey) {
        const mvpBindGroup = this.mvpUniformManager.updateMVPUniforms(renderable, frameData);
        renderPass.setBindGroup(1, mvpBindGroup);
        boundUniformKey = renderable.uniformKey;
      }

      renderPass.drawIndexed(geometry.indexCount);
    }
  }

  private ensurePipeline(material: HGRPMaterialDescriptor): GPURenderPipeline {
    const shaderId = hgrpPassShaderId('eyeOverlay', material.permutation);
    const existing = this.pipelines.get(shaderId);
    if (existing) {
      return existing;
    }

    const shaderModule = this.shaderManager.getShaderModule(shaderId);

    const timeLayout = this.bindGroupManager.getBindGroupLayout('timeBindGroupLayout');
    const mvpLayout = this.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!timeLayout || !mvpLayout) {
      throw new Error('Time/MVP bind group layouts not found for the eye overlay pipeline');
    }
    const eyeLayout = getOrCreateHGRPMaterialBindGroupLayout(
      this.bindGroupManager,
      material.permutation,
    );
    const frameLayout = getOrCreateHGRPFrameBindGroupLayout(this.bindGroupManager);

    const pipeline = this.device.createRenderPipeline({
      label: `hgrp_eye_overlay_pipeline:${shaderId}`,
      layout: this.device.createPipelineLayout({
        label: `hgrp_eye_overlay_pipeline_layout:${shaderId}`,
        bindGroupLayouts: [timeLayout, mvpLayout, eyeLayout, frameLayout],
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
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: {
        format: this.context.getDepthStencilFormat(),
        // Depth-tested against the real scene; the biased projection provides the gating.
        // No depth write: the biased depths must not pollute the buffer.
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
    });
    this.pipelines.set(shaderId, pipeline);
    return pipeline;
  }
}
