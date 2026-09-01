import { FrameData } from '@renderer/frame/types';
import { HGRPMaterialDescriptor } from '@renderer/material/hgrp';
import gltfSkinningShader from '../../core/shaders/core/gltf_skinning.wgsl';
import depthPrepassShader from '../../core/shaders/passes/depth_prepass.wgsl';
import { BindGroupManager } from '../../core/BindGroupManager';
import { GeometryManager } from '../../core/GeometryManager';
import { MVPUniformManager } from '../../core/MVPUniformManager';
import { createGltfVertexBufferLayout } from '../../core/pipeline/vertexLayouts';

export interface DepthPrepassDeps {
  device: GPUDevice;
  bindGroupManager: BindGroupManager;
  mvpUniformManager: MVPUniformManager;
  geometryManager: GeometryManager;
  depthFormat: GPUTextureFormat;
  // Recreated on resize, injected as a closure like the ForwardPass attachments
  getDepthView(): GPUTextureView;
}

/**
 * Depth Prepass
 *
 * Renders the HGRP character (opaque + mask draws) depth-only into its own depth texture,
 * which the forward pass samples for screen-space effects — the depth rim needs the scene
 * depth around a fragment while that fragment is being shaded, which the forward pass's own
 * depth attachment cannot provide. The game runs the same structure (its opaque materials
 * carry _ZTest Equal — evidence of a completed depth prepass).
 *
 * v1 scope: HGRP renderables only (the character — everything the rim reads edges from;
 * absent objects read as far plane, which the edge test treats as a silhouette, the desired
 * outcome). Cutout alpha is not evaluated (clipped regions leave depth — minor rim artifact
 * on cloth cutouts). The forward pass still writes its own depth attachment; converging on
 * ZTest-Equal reuse of this texture is a later optimization.
 * Renderer-private, constructor-wired — same rules as ForwardPass.
 */
export class DepthPrepass {
  private pipeline?: GPURenderPipeline;

  constructor(private readonly deps: DepthPrepassDeps) {}

  execute(commandEncoder: GPUCommandEncoder, frameData: FrameData): void {
    const items = frameData.renderables.filter(
      (renderable) =>
        renderable.material.materialType === 'hgrp' &&
        (renderable.material as HGRPMaterialDescriptor).alphaMode !== 'blend',
    );

    // The pass always runs: rim sampling expects a cleared (far-plane) texture even when
    // nothing is drawn into it.
    const renderPass = commandEncoder.beginRenderPass({
      label: 'depth_prepass',
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.deps.getDepthView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    if (items.length > 0) {
      renderPass.setPipeline(this.ensurePipeline());

      let boundGeometryId: string | undefined;
      let boundUniformKey: string | undefined;
      for (const renderable of items) {
        const geometry = this.deps.geometryManager.createGeometryFromData(renderable.geometryId, {
          geometryData: renderable.geometryData,
        });
        if (renderable.uniformKey !== boundUniformKey) {
          const mvpBindGroup = this.deps.mvpUniformManager.updateMVPUniforms(renderable, frameData);
          renderPass.setBindGroup(0, mvpBindGroup);
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

    renderPass.end();
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }

    const mvpLayout = this.deps.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!mvpLayout) {
      throw new Error('MVP bind group layout not found for the depth prepass pipeline');
    }

    const shaderModule = this.deps.device.createShaderModule({
      label: 'depth_prepass_shader',
      // Standalone pass source, so the shared skinning fragment is spliced in here rather
      // than through the material-shader include machinery
      code: `${gltfSkinningShader}\n${depthPrepassShader}`,
    });

    this.pipeline = this.deps.device.createRenderPipeline({
      label: 'depth_prepass_pipeline',
      layout: this.deps.device.createPipelineLayout({
        label: 'depth_prepass_pipeline_layout',
        bindGroupLayouts: [mvpLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [createGltfVertexBufferLayout()],
      },
      // Depth-only: no fragment stage. Cull nothing so open/double-sided surfaces
      // (skirts, hair cards) leave complete depth.
      primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' },
      depthStencil: {
        format: this.deps.depthFormat,
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    return this.pipeline;
  }
}
