import debugViewShader from '../../core/shaders/passes/debug_view.wgsl';
import { Inject, ServiceTokens } from '../../core/decorators';
import { WebGPUContext } from '../../core/WebGPUContext';
import { ActiveDebugView, sceneSettings } from '../sceneSettings';
import { bloomSettings, packBloomThreshold } from './BloomPass';

// Mode codes of debug_view.wgsl
const MODE_CODES: Record<Exclude<ActiveDebugView, 'off'>, number> = {
  material: 1,
  bloom: 2,
  luminance: 3,
  stencil: 4,
  diff: 5,
};

// The 'diff' view holds the frame it is switched on at; this asks for a fresh hold on the next
// frame (module-scoped like the settings — the GUI has no pass instance).
let frameHoldRequested = false;
export function requestFrameHold(): void {
  frameHoldRequested = true;
}

/**
 * The frame textures the views read, all renderer-owned and recreated on resize (closures,
 * same rule as the other passes), plus the swapchain view the pass presents to.
 */
export interface DebugViewTargets {
  getSceneColor(): GPUTexture;
  getBloomLevelView(level: number): GPUTextureView;
  getDepthStencilTexture(): GPUTexture;
  /** This frame's tonemap output; COPY_SRC, the diff view holds a copy of it */
  getLdrTexture(): GPUTexture;
  getOutputView(): GPUTextureView;
}

/**
 * Debug View Pass
 *
 * The one consumer of the debug-view settings besides the material debug permutation: a
 * fullscreen pass at the end of the frame that presents one of the frame's intermediate
 * textures — the raw material-view output, a bloom chain level, the exposed-luminance heat map
 * with the bloom-threshold contour, the stencil groups, or the difference against a held
 * frame — straight to the swapchain, in place of the anti-aliasing stages. It runs only while
 * a view is selected, so the production passes stay free of debug code and pay nothing for
 * it. Owns the held frame of the diff view (a copy of the LDR output, taken on the frame the
 * view is entered or a hold is requested). Fixed pass, builds its own shader/pipeline —
 * same rules as TonemapPass. Renderer-private, constructor-wired.
 */
export class DebugViewPass {
  private pipeline?: GPURenderPipeline;
  private bindGroupLayout?: GPUBindGroupLayout;
  private sampler?: GPUSampler;
  private settingsBuffer?: GPUBuffer;
  private readonly settingsData = new Float32Array(12);

  private bindGroup?: GPUBindGroup;
  private bindGroupKey?: {
    sceneColor: GPUTexture;
    bloomView: GPUTextureView;
    depthStencil: GPUTexture;
    ldr: GPUTexture;
  };
  private heldFrame?: GPUTexture;
  private heldFrameSource?: GPUTexture;
  private heldFrameValid = false;

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
  @Inject(ServiceTokens.WEBGPU_CONTEXT) private accessor context!: WebGPUContext;

  constructor(private readonly targets: DebugViewTargets) {}

  execute(commandEncoder: GPUCommandEncoder, view: Exclude<ActiveDebugView, 'off'>): void {
    const pipeline = this.ensurePipeline();
    const ldr = this.targets.getLdrTexture();
    const bindGroup = this.ensureBindGroup(ldr);

    // The hold is a copy ordered ahead of the draw, so the frame that takes it already
    // compares against itself: flat grey, the baseline every later frame is read against
    if (view !== 'diff') {
      this.heldFrameValid = false;
    } else if (!this.heldFrameValid || frameHoldRequested) {
      commandEncoder.copyTextureToTexture(
        { texture: ldr },
        { texture: this.heldFrame! },
        { width: ldr.width, height: ldr.height },
      );
      this.heldFrameValid = true;
      frameHoldRequested = false;
    }

    this.settingsData[0] = MODE_CODES[view];
    this.settingsData[1] = sceneSettings.exposure;
    this.settingsData[2] = sceneSettings.debugView.diffGain;
    packBloomThreshold(bloomSettings.threshold, this.settingsData, 4);
    packBloomThreshold(bloomSettings.characterThreshold, this.settingsData, 8);
    this.device.queue.writeBuffer(this.settingsBuffer!, 0, this.settingsData);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'debug_view_pass',
      colorAttachments: [
        {
          view: this.targets.getOutputView(),
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
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }
    const device = this.device;
    const shaderModule = device.createShaderModule({
      label: 'debug_view_shader',
      code: debugViewShader,
    });
    this.sampler = device.createSampler({
      label: 'debug_view_sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.settingsBuffer = device.createBuffer({
      label: 'debug_view_settings',
      size: this.settingsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const fragment = GPUShaderStage.FRAGMENT;
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'debug_view_bind_group_layout',
      entries: [
        { binding: 0, visibility: fragment, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: fragment, texture: { sampleType: 'float' } },
        { binding: 2, visibility: fragment, sampler: { type: 'filtering' } },
        { binding: 3, visibility: fragment, texture: { sampleType: 'uint' } },
        { binding: 4, visibility: fragment, texture: { sampleType: 'unfilterable-float' } },
        { binding: 5, visibility: fragment, texture: { sampleType: 'unfilterable-float' } },
        { binding: 6, visibility: fragment, buffer: { type: 'uniform' } },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      label: 'debug_view_pipeline',
      layout: device.createPipelineLayout({
        label: 'debug_view_pipeline_layout',
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.context.getPreferredFormat() }],
      },
      primitive: { topology: 'triangle-list' },
    });
    return this.pipeline;
  }

  private ensureBindGroup(ldr: GPUTexture): GPUBindGroup {
    const key = {
      sceneColor: this.targets.getSceneColor(),
      bloomView: this.targets.getBloomLevelView(sceneSettings.debugView.bloomLevel),
      depthStencil: this.targets.getDepthStencilTexture(),
      ldr,
    };
    const cached = this.bindGroupKey;
    if (
      this.bindGroup &&
      cached &&
      cached.sceneColor === key.sceneColor &&
      cached.bloomView === key.bloomView &&
      cached.depthStencil === key.depthStencil &&
      cached.ldr === key.ldr
    ) {
      return this.bindGroup;
    }

    // The held frame follows the LDR texture (size and format)
    if (this.heldFrameSource !== ldr) {
      this.heldFrame?.destroy();
      this.heldFrame = this.device.createTexture({
        label: 'debug_view_held_frame',
        size: { width: ldr.width, height: ldr.height },
        format: ldr.format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.heldFrameSource = ldr;
      this.heldFrameValid = false;
    }

    this.bindGroup = this.device.createBindGroup({
      label: 'debug_view_bind_group',
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: key.sceneColor.createView() },
        { binding: 1, resource: key.bloomView },
        { binding: 2, resource: this.sampler! },
        { binding: 3, resource: key.depthStencil.createView({ aspect: 'stencil-only' }) },
        { binding: 4, resource: ldr.createView() },
        { binding: 5, resource: this.heldFrame!.createView() },
        { binding: 6, resource: { buffer: this.settingsBuffer! } },
      ],
    });
    this.bindGroupKey = key;
    return this.bindGroup;
  }
}
