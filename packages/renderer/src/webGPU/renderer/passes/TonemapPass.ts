import tonemapShader from '../../core/shaders/passes/tonemap.wgsl';

export interface TonemapPassDeps {
  device: GPUDevice;
  outputFormat: GPUTextureFormat;
  // The HDR scene-color texture is recreated only on resize; the swapchain view changes
  // every frame — both are injected as closures like ForwardPass attachments.
  getInputTexture(): GPUTexture;
  getOutputView(): GPUTextureView;
}

// Global tonemap controls, mutated by the calibration GUI (module-scoped like the pass
// itself — TonemapPass is renderer-private and constructor-wired, not a DI service).
export const tonemapSettings = {
  // Linear-light multiplier applied before the ACES curve. The scene's static lights are
  // normalized around 1.0, which may sit darker in linear space than the old
  // display-referred calibration — this is the knob that re-anchors mid-grey.
  exposure: 1.0,
};

/**
 * Tonemap Pass
 *
 * Fullscreen resolve of the HDR scene-color target to the swapchain. A fixed post-process
 * pass with exactly one pipeline and no material variance, so it builds its own shader
 * module and pipeline directly instead of going through the material-pipeline machinery
 * (ShaderManager registration and semantic pipeline keys exist for material shaders).
 * Renderer-private, constructor-wired — same rules as ForwardPass.
 *
 * Writes through the swapchain's sRGB view: the shader outputs linear display-referred
 * values (exposure x ACES) and the hardware performs the sRGB encode.
 */
export class TonemapPass {
  private pipeline?: GPURenderPipeline;
  private bindGroupLayout?: GPUBindGroupLayout;
  private bindGroup?: GPUBindGroup;
  private bindGroupInput?: GPUTexture;
  private settingsBuffer?: GPUBuffer;
  private readonly settingsData = new Float32Array(4);

  constructor(private readonly deps: TonemapPassDeps) {}

  execute(commandEncoder: GPUCommandEncoder): void {
    const pipeline = this.ensurePipeline();
    const bindGroup = this.ensureBindGroup();

    this.settingsData[0] = tonemapSettings.exposure;
    this.deps.device.queue.writeBuffer(this.settingsBuffer!, 0, this.settingsData);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'tonemap_pass',
      colorAttachments: [
        {
          view: this.deps.getOutputView(),
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

    const shaderModule = this.deps.device.createShaderModule({
      label: 'tonemap_shader',
      code: tonemapShader,
    });

    this.bindGroupLayout = this.deps.device.createBindGroupLayout({
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
      ],
    });

    this.pipeline = this.deps.device.createRenderPipeline({
      label: 'tonemap_pipeline',
      layout: this.deps.device.createPipelineLayout({
        label: 'tonemap_pipeline_layout',
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.deps.outputFormat }],
      },
      primitive: { topology: 'triangle-list' },
    });

    return this.pipeline;
  }

  private ensureBindGroup(): GPUBindGroup {
    const input = this.deps.getInputTexture();
    if (this.bindGroup && this.bindGroupInput === input) {
      return this.bindGroup;
    }

    if (!this.settingsBuffer) {
      this.settingsBuffer = this.deps.device.createBuffer({
        label: 'tonemap_settings',
        size: this.settingsData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    this.bindGroup = this.deps.device.createBindGroup({
      label: 'tonemap_bind_group',
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: { buffer: this.settingsBuffer } },
      ],
    });
    this.bindGroupInput = input;
    return this.bindGroup;
  }
}
