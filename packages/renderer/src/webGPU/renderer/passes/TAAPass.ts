import { mat4 } from 'gl-matrix';
import { Inject, ServiceTokens } from '../../core/decorators';
import { CameraData } from '../../../frame/types';
import taaShader from '../../core/shaders/passes/taa.wgsl';

export interface TAATargets {
  /** Encoded LDR output of the tonemap pass (this frame, rendered with the projection jitter) */
  getInputTexture(): GPUTexture;
  /** The forward pass depth attachment (depth-stencil); sampled through a depth-only view */
  getDepthTexture(): GPUTexture;
}

// TAA controls, mutated by the calibration GUI (module singleton, same rule as
// tonemapSettings). `blend` is the weight of the current frame: lower = more history, more
// stable and softer; higher = crisper and more aliased.
export const taaSettings = {
  blend: 0.1,
};

const HISTORY_FORMAT: GPUTextureFormat = 'rgba8unorm';
const JITTER_SEQUENCE_LENGTH = 8;

function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

// Sub-pixel projection offset for a frame, in pixels, centred on zero: the Halton (2, 3)
// sequence over an 8-frame cycle, the standard TAA sample pattern.
export function taaJitterPixels(frameIndex: number): [number, number] {
  const i = (frameIndex % JITTER_SEQUENCE_LENGTH) + 1;
  return [halton(i, 2) - 0.5, halton(i, 3) - 0.5];
}

/**
 * TAA Pass
 *
 * Temporal anti-aliasing over the encoded LDR image: the geometry passes are rendered with a
 * per-frame sub-pixel projection jitter (MVPUniformManager.setProjectionJitter, fed by
 * taaJitterPixels), and this pass accumulates them into a history texture, reprojecting the
 * previous frame through the depth buffer with the unjittered view-projection matrices.
 * There is no velocity buffer: object motion is handled only by clamping the history to the
 * current frame's neighbourhood, which is why the blend weight is a calibration knob. Owns
 * two history textures (ping-pong); the resolve of frame N is both the presented image and
 * frame N+1's history. Fixed post-process pass, builds its shader/pipeline directly — same
 * rules as TonemapPass. Renderer-private, constructor-wired.
 */
export class TAAPass {
  private pipeline?: GPURenderPipeline;
  private bindGroupLayout?: GPUBindGroupLayout;
  private sampler?: GPUSampler;
  private paramsBuffer?: GPUBuffer;
  private readonly paramsData = new Float32Array(36);

  private history: [GPUTexture, GPUTexture] | undefined;
  private historySource?: GPUTexture;
  private current = 0;
  private historyValid = false;
  private readonly bindGroups: (GPUBindGroup | undefined)[] = [undefined, undefined];
  private bindGroupInput?: GPUTexture;
  private bindGroupDepth?: GPUTexture;

  private readonly prevViewProj = mat4.create();
  private readonly invViewProj = mat4.create();

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;

  /**
   * Both targets are renderer-owned and recreated on resize: the tonemap's LDR output for this
   * frame, and the forward pass depth attachment it reprojects through.
   */
  constructor(private readonly targets: TAATargets) {}

  /** The resolve written this frame — the image to present (or to hand to FXAA). */
  getOutputTexture(): GPUTexture {
    this.ensureResources();
    return this.history![this.current];
  }

  /** Drop the accumulated history; the next execute blends nothing in. */
  invalidateHistory(): void {
    this.historyValid = false;
  }

  execute(commandEncoder: GPUCommandEncoder, camera: CameraData): void {
    this.ensureResources();
    const pipeline = this.ensurePipeline();
    const previous = this.current;
    this.current = 1 - this.current;
    const bindGroup = this.ensureBindGroup(this.current, previous);

    mat4.invert(this.invViewProj, camera.viewProjectionMatrix as unknown as mat4);
    this.paramsData.set(this.prevViewProj, 0);
    this.paramsData.set(this.invViewProj, 16);
    this.paramsData[32] = taaSettings.blend;
    this.paramsData[33] = this.historyValid ? 0 : 1;
    this.device.queue.writeBuffer(this.paramsBuffer!, 0, this.paramsData);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'taa_pass',
      colorAttachments: [
        {
          view: this.history![this.current].createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(3);
    renderPass.end();

    mat4.copy(this.prevViewProj, camera.viewProjectionMatrix as unknown as mat4);
    this.historyValid = true;
  }

  // History textures follow the input's size; a new input texture (resize) rebuilds them
  // and invalidates the history.
  private ensureResources(): void {
    const input = this.targets.getInputTexture();
    if (this.history && this.historySource === input) {
      return;
    }
    this.history?.forEach((texture) => texture.destroy());
    const make = (index: number) =>
      this.device.createTexture({
        label: `taa_history_${index}`,
        size: { width: input.width, height: input.height },
        format: HISTORY_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.history = [make(0), make(1)];
    this.historySource = input;
    this.historyValid = false;
    this.bindGroups[0] = undefined;
    this.bindGroups[1] = undefined;
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }
    const shaderModule = this.device.createShaderModule({
      label: 'taa_shader',
      code: taaShader,
    });
    this.sampler = this.device.createSampler({
      label: 'taa_history_sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.paramsBuffer = this.device.createBuffer({
      label: 'taa_params',
      size: this.paramsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'taa_bind_group_layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'unfilterable-float' },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this.pipeline = this.device.createRenderPipeline({
      label: 'taa_pipeline',
      layout: this.device.createPipelineLayout({
        label: 'taa_pipeline_layout',
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: HISTORY_FORMAT }],
      },
      primitive: { topology: 'triangle-list' },
    });
    return this.pipeline;
  }

  // One bind group per history parity (reads the other history texture); rebuilt when the
  // input or depth texture is recreated.
  private ensureBindGroup(current: number, previous: number): GPUBindGroup {
    const input = this.targets.getInputTexture();
    const depth = this.targets.getDepthTexture();
    if (this.bindGroupInput !== input || this.bindGroupDepth !== depth) {
      this.bindGroups[0] = undefined;
      this.bindGroups[1] = undefined;
      this.bindGroupInput = input;
      this.bindGroupDepth = depth;
    }
    const cached = this.bindGroups[current];
    if (cached) {
      return cached;
    }
    const bindGroup = this.device.createBindGroup({
      label: `taa_bind_group_${current}`,
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: this.history![previous].createView() },
        { binding: 2, resource: this.sampler! },
        { binding: 3, resource: depth.createView({ aspect: 'depth-only' }) },
        { binding: 4, resource: { buffer: this.paramsBuffer! } },
      ],
    });
    this.bindGroups[current] = bindGroup;
    return bindGroup;
  }
}
