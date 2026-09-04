import { FrameData } from '../../../../frame/types';
import { hgrpHairYieldRef, HGRPMaterialDescriptor } from '../../../../material/hgrp';
import { BindGroupManager } from '../../../core/BindGroupManager';
import { GeometryManager } from '../../../core/GeometryManager';
import {
  getOrCreateHGRPFrameBindGroupLayout,
  getOrCreateHGRPMaterialBindGroupLayout,
  hgrpStencilState,
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
 * HGRP Hair Under-Brow Stage
 *
 * Draws the hair strands inside the brow cut-out — the bangs _HairBrowMask marks — right
 * after the opaque walk, with the game's hair stencil yield (hgrp-decompiled-formulas.md §5:
 * Ref _HairStencilRef, ReadMask 16, GEqual): the strands skip every pixel the brow stamped in
 * the opaque walk and the body did not take back, so the brow shows through the bangs at full
 * strength, while the face in front of a brow still hides it. The hair's main draw leaves these
 * strands out (materials/HGRPHair.wgsl), so nothing is drawn twice.
 *
 * Same shading and vertex stage as the hair material; only the discard polarity and the stencil
 * state differ, which the semantic pipeline key cannot express — so the pipelines are
 * pass-private, one per Hair permutation met.
 */
export class HGRPHairUnderBrowStage {
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
   * Encode the under-brow draws. Runs right after the opaque walk, so every stamp the brow
   * left and the body took back is in the stencil; the caller's encode-state cache is invalid
   * afterwards.
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
        renderPass.setStencilReference(
          hgrpHairYieldRef(renderable.material as HGRPMaterialDescriptor),
        );
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
    const shaderId = hgrpPassShaderId('hairUnderBrow', material.permutation);
    const key = `${shaderId}:${material.doubleSided ? 'none' : 'back'}`;
    const existing = this.pipelines.get(key);
    if (existing) {
      return existing;
    }

    const shaderModule = this.shaderManager.getShaderModule(shaderId);

    const timeLayout = this.bindGroupManager.getBindGroupLayout('timeBindGroupLayout');
    const mvpLayout = this.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!timeLayout || !mvpLayout) {
      throw new Error('Time/MVP bind group layouts not found for the hair under-brow pipeline');
    }
    const hairLayout = getOrCreateHGRPMaterialBindGroupLayout(
      this.bindGroupManager,
      material.permutation,
    );
    const frameLayout = getOrCreateHGRPFrameBindGroupLayout(this.bindGroupManager);

    const pipeline = this.device.createRenderPipeline({
      label: `hgrp_hair_under_brow_pipeline:${key}`,
      layout: this.device.createPipelineLayout({
        label: `hgrp_hair_under_brow_pipeline_layout:${shaderId}`,
        bindGroupLayouts: [timeLayout, mvpLayout, hairLayout, frameLayout],
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
      primitive: {
        topology: 'triangle-list',
        cullMode: material.doubleSided ? 'none' : 'back',
        frontFace: 'ccw',
      },
      // An opaque draw like the hair body's, plus the yield: depth-tested and written against
      // everything the opaque walk drew.
      depthStencil: {
        format: this.context.getDepthStencilFormat(),
        depthWriteEnabled: true,
        depthCompare: 'less',
        ...hgrpStencilState('hairYield'),
      },
    });
    this.pipelines.set(key, pipeline);
    return pipeline;
  }
}
