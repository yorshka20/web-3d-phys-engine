import tonemapShader from '../../core/shaders/passes/tonemap.wgsl';
import { Inject, ServiceTokens } from '../../core/decorators';
import { isHGRPDebugViewOn } from '../sceneSettings';
import { bloomSettings } from './BloomPass';

export interface TonemapTargets {
  getInputTexture(): GPUTexture;
  getBloomView(): GPUTextureView;
  getOutputView(): GPUTextureView;
}

// Global tonemap controls, mutated by the calibration GUI (module-scoped like the pass
// itself — TonemapPass is renderer-private and constructor-wired, not a DI service).
export const tonemapSettings = {
  // Linear-light multiplier applied before the ACES curve. The scene's static lights are
  // normalized around 1.0, which may sit darker in linear space than the old
  // display-referred calibration — this is the knob that re-anchors mid-grey.
  exposure: 1.0,
  // Grading after the curve, in the encoded (perceptual) domain: contrast about mid grey,
  // saturation about luma, temperature as an opposing red/blue gain (negative = cooler).
  // Identity by default; the in-game look reads cooler and higher-contrast than ours, and
  // these are the knobs to find by how much before a grading LUT is worth baking.
  contrast: 1.0,
  saturation: 1.0,
  temperature: 0.0,
};

/**
 * Tonemap Pass
 *
 * Composites the bloom chain onto the HDR scene color, applies exposure x ACES and the
 * manual sRGB encode, writing an ENCODED LDR texture that the FXAA pass consumes (FXAA
 * expects perceptual-domain input, so the encode cannot be left to an sRGB view here).
 * A fixed post-process pass with exactly one pipeline and no material variance, so it
 * builds its own shader module and pipeline directly instead of going through the
 * material-pipeline machinery (ShaderManager registration and semantic pipeline keys exist
 * for material shaders). Renderer-private, constructor-wired — same rules as ForwardPass.
 */
export class TonemapPass {
  private pipeline?: GPURenderPipeline;
  private bindGroupLayout?: GPUBindGroupLayout;
  private bindGroup?: GPUBindGroup;
  private bindGroupInput?: GPUTexture;
  private bindGroupBloomView?: GPUTextureView;
  private bloomSampler?: GPUSampler;
  private settingsBuffer?: GPUBuffer;
  private readonly settingsData = new Float32Array(8);

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;

  /**
   * `outputFormat` is the renderer's choice of LDR target format, not something the context
   * dictates, so it stays an argument. The three views are closures: the scene-color texture
   * is recreated on resize, and the bloom and output views can change per frame.
   */
  constructor(
    private readonly outputFormat: GPUTextureFormat,
    private readonly targets: TonemapTargets,
  ) {}

  execute(commandEncoder: GPUCommandEncoder): void {
    const pipeline = this.ensurePipeline();
    const bindGroup = this.ensureBindGroup();

    this.settingsData[0] = tonemapSettings.exposure;
    this.settingsData[1] = bloomSettings.intensity;
    this.settingsData[2] = tonemapSettings.contrast;
    this.settingsData[3] = tonemapSettings.saturation;
    this.settingsData[4] = tonemapSettings.temperature;
    this.settingsData[5] = isHGRPDebugViewOn() ? 1 : 0;
    this.device.queue.writeBuffer(this.settingsBuffer!, 0, this.settingsData);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'tonemap_pass',
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

    const shaderModule = this.device.createShaderModule({
      label: 'tonemap_shader',
      code: tonemapShader,
    });

    this.bloomSampler = this.device.createSampler({
      label: 'tonemap_bloom_sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'tonemap_bind_group_layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          // textureLoad only — no sampler, works regardless of float filterability
          texture: { sampleType: 'unfilterable-float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'tonemap_pipeline',
      layout: this.device.createPipelineLayout({
        label: 'tonemap_pipeline_layout',
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.outputFormat }],
      },
      primitive: { topology: 'triangle-list' },
    });

    return this.pipeline;
  }

  private ensureBindGroup(): GPUBindGroup {
    const input = this.targets.getInputTexture();
    const bloomView = this.targets.getBloomView();
    if (this.bindGroup && this.bindGroupInput === input && this.bindGroupBloomView === bloomView) {
      return this.bindGroup;
    }

    if (!this.settingsBuffer) {
      this.settingsBuffer = this.device.createBuffer({
        label: 'tonemap_settings',
        size: this.settingsData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    this.bindGroup = this.device.createBindGroup({
      label: 'tonemap_bind_group',
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: { buffer: this.settingsBuffer } },
        { binding: 2, resource: bloomView },
        { binding: 3, resource: this.bloomSampler! },
      ],
    });
    this.bindGroupInput = input;
    this.bindGroupBloomView = bloomView;
    return this.bindGroup;
  }
}
