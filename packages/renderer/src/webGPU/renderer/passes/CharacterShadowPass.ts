import { FrameData, RenderData } from '@renderer/frame/types';
import { HGRPMaterialDescriptor } from '@renderer/material/hgrp';
import { mat4, vec3 } from 'gl-matrix';

import { BindGroupManager } from '../../core/BindGroupManager';
import { Inject, ServiceTokens } from '../../core/decorators';
import { GeometryManager } from '../../core/GeometryManager';
import { MVPUniformManager } from '../../core/MVPUniformManager';
import { createGltfVertexBufferLayout } from '../../core/pipeline/vertexLayouts';
import gltfSkinningShader from '../../core/shaders/core/gltf_skinning.wgsl';
import characterShadowShader from '../../core/shaders/passes/character_shadow.wgsl';
import { BufferType } from '../../core/types';
import { BufferManager } from '../../core/BufferManager';
import { sceneSettings } from '../sceneSettings';

/**
 * Character self-shadow pass
 *
 * Renders the HGRP characters depth-only from the key light into a square shadow map, which the
 * shading samples as its occlusion term. This is the game's structure, not an addition: its
 * skin and cloth variants multiply the lighting ceiling by `_ScreenSpaceShadowMask.y`
 * (hgrp-decompiled-formulas.md §1.5 / §2), and with that term at 1 a character has no hair
 * shadow on the face and no sleeve shadow on the arm. The captured frame also has
 * `_CharacterParams1.z = 1`, which turns the DIRECTIONAL shadow off for characters — so a
 * character's shadows are its own, and this pass covers only the characters.
 *
 * The volume is the bounding sphere of the shadow-casting HGRP draws, so it is stable as they
 * move (a tight box fit swims). Bind-pose geometry bounds are what the frame carries, so a
 * posed limb can reach outside them; the sphere is padded for that.
 */
export interface CharacterShadowTargets {
  getShadowView(): GPUTextureView;
  getShadowMapSize(): number;
  getShadowFormat(): GPUTextureFormat;
}

// Pad on the geometry bounds, as a fraction of the radius: the bounds are the bind pose's, and
// an arm raised over the head reaches past them.
const POSE_PADDING = 1.25;

export class CharacterShadowPass {
  private pipeline?: GPURenderPipeline;
  private cameraBindGroup?: GPUBindGroup;

  // The light's view-projection for this frame, which the shading needs to look the map up;
  // identity and `valid` false when nothing casts.
  readonly lightViewProj = mat4.create();
  private valid = false;
  // Half the volume's depth range in world units — the scale a world-space bias converts through
  private radius = 1;

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
  @Inject(ServiceTokens.BIND_GROUP_MANAGER) private accessor bindGroupManager!: BindGroupManager;
  @Inject(ServiceTokens.MVP_UNIFORM_MANAGER) private accessor mvpUniformManager!: MVPUniformManager;
  @Inject(ServiceTokens.GEOMETRY_MANAGER) private accessor geometryManager!: GeometryManager;
  @Inject(ServiceTokens.BUFFER_MANAGER) private accessor bufferManager!: BufferManager;

  constructor(private readonly targets: CharacterShadowTargets) {}

  // (texel size in uv, ndc depth bias, strength, valid) and (world-space normal offset, 0, 0, 0)
  // — the two rows the SceneLighting uniform carries for the shading's lookup.
  shadowParams(): [number, number, number, number] {
    const size = this.targets.getShadowMapSize();
    return [
      1 / size,
      sceneSettings.shadow.depthBias,
      sceneSettings.shadow.strength,
      this.valid ? 1 : 0,
    ];
  }

  normalOffset(): number {
    // One texel's world size times the knob: the offset that walks a fragment off its own
    // surface scales with how coarse the map is here.
    return (sceneSettings.shadow.normalBias * (2 * this.radius)) / this.targets.getShadowMapSize();
  }

  /**
   * Fits the light volume to this frame's casters and writes the light camera. Runs before the
   * SceneLighting uniform is packed, because that uniform carries the matrix the shading reads.
   */
  prepare(frameData: FrameData): void {
    this.valid = false;
    if (!sceneSettings.shadow.enabled) {
      return;
    }
    const casters = this.casters(frameData);
    if (casters.length === 0) {
      return;
    }

    const min = vec3.fromValues(Infinity, Infinity, Infinity);
    const max = vec3.fromValues(-Infinity, -Infinity, -Infinity);
    const corner = vec3.create();
    for (const renderable of casters) {
      const bounds = renderable.geometryData.bounds;
      for (let i = 0; i < 8; i++) {
        vec3.set(
          corner,
          i & 1 ? bounds.max[0] : bounds.min[0],
          i & 2 ? bounds.max[1] : bounds.min[1],
          i & 4 ? bounds.max[2] : bounds.min[2],
        );
        vec3.transformMat4(corner, corner, renderable.worldMatrix);
        vec3.min(min, min, corner);
        vec3.max(max, max, corner);
      }
    }

    const center = vec3.create();
    vec3.add(center, min, max);
    vec3.scale(center, center, 0.5);
    const extent = vec3.create();
    vec3.sub(extent, max, min);
    this.radius = Math.max(vec3.length(extent) * 0.5 * POSE_PADDING, 1e-3);

    // Look at the volume from the light. `up` is the world up unless the light is vertical.
    const direction = vec3.normalize(vec3.create(), sceneSettings.lightDirection as vec3);
    const eye = vec3.scaleAndAdd(vec3.create(), center, direction, this.radius);
    const up: vec3 = Math.abs(direction[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
    const view = mat4.lookAt(mat4.create(), eye, center, up);
    // Zero-to-one depth, as WebGPU clips it; the shading's lookup assumes that range.
    const projection = mat4.orthoZO(
      mat4.create(),
      -this.radius,
      this.radius,
      -this.radius,
      this.radius,
      0,
      2 * this.radius,
    );
    mat4.multiply(this.lightViewProj, projection, view);
    this.valid = true;

    this.device.queue.writeBuffer(this.cameraBuffer(), 0, new Float32Array(this.lightViewProj));
  }

  execute(commandEncoder: GPUCommandEncoder, frameData: FrameData): void {
    const casters = this.valid ? this.casters(frameData) : [];
    if (casters.length === 0) {
      // Nothing to render AND nothing to hide: `prepare` left the parameters marked invalid, so
      // the shading returns 1 without sampling and a stale map cannot leak into the picture.
      // Skipping the pass keeps a stage with no characters from clearing the map every frame.
      return;
    }

    const renderPass = commandEncoder.beginRenderPass({
      label: 'character_shadow_pass',
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.targets.getShadowView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    renderPass.setPipeline(this.ensurePipeline());
    renderPass.setBindGroup(1, this.ensureCameraBindGroup());

    let boundGeometryId: string | undefined;
    let boundUniformKey: string | undefined;
    for (const renderable of casters) {
      const geometry = this.geometryManager.createGeometryFromData(renderable.geometryId, {
        geometryData: renderable.geometryData,
      });
      if (renderable.uniformKey !== boundUniformKey) {
        renderPass.setBindGroup(0, this.mvpUniformManager.updateMVPUniforms(renderable, frameData));
        boundUniformKey = renderable.uniformKey;
      }
      if (renderable.geometryId !== boundGeometryId) {
        renderPass.setVertexBuffer(0, geometry.vertexBuffer);
        renderPass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
        boundGeometryId = renderable.geometryId;
      }
      renderPass.drawIndexed(geometry.indexCount);
    }

    renderPass.end();
  }

  // Blend materials do not occlude (the energy wings, the shadow shells); everything else the
  // character is made of does.
  private casters(frameData: FrameData): RenderData[] {
    return frameData.renderables.filter(
      (renderable) =>
        renderable.material.materialType === 'hgrp' &&
        renderable.castShadow &&
        (renderable.material as HGRPMaterialDescriptor).alphaMode !== 'blend',
    );
  }

  private cameraBuffer(): GPUBuffer {
    return this.bufferManager.createCustomBuffer('character_shadow_camera', {
      type: BufferType.UNIFORM,
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private ensureCameraBindGroup(): GPUBindGroup {
    if (!this.cameraBindGroup) {
      this.cameraBindGroup = this.device.createBindGroup({
        label: 'character_shadow_camera_bind_group',
        layout: this.cameraLayout(),
        entries: [{ binding: 0, resource: { buffer: this.cameraBuffer() } }],
      });
    }
    return this.cameraBindGroup;
  }

  private cameraLayout(): GPUBindGroupLayout {
    return this.bindGroupManager.createBindGroupLayout('character_shadow_camera_layout', {
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
      label: 'character_shadow_camera_layout',
    });
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }
    const mvpLayout = this.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
    if (!mvpLayout) {
      throw new Error('MVP bind group layout not found for the character shadow pipeline');
    }

    const shaderModule = this.device.createShaderModule({
      label: 'character_shadow_shader',
      code: `${gltfSkinningShader}\n${characterShadowShader}`,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'character_shadow_pipeline',
      layout: this.device.createPipelineLayout({
        label: 'character_shadow_pipeline_layout',
        bindGroupLayouts: [mvpLayout, this.cameraLayout()],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [createGltfVertexBufferLayout()],
      },
      // Cull nothing: hair cards and skirts are open surfaces, and culling either face of them
      // punches holes in the occluder. Acne is handled by the depth bias below plus the
      // shading's normal offset.
      primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' },
      depthStencil: {
        format: this.targets.getShadowFormat(),
        depthWriteEnabled: true,
        depthCompare: 'less',
        depthBias: 2,
        depthBiasSlopeScale: 2.5,
      },
    });

    return this.pipeline;
  }
}
