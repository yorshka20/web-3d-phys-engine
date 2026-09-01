import bloomShader from '../../core/shaders/passes/bloom.wgsl';

export interface BloomPassDeps {
  device: GPUDevice;
  // HDR scene-color texture (recreated on resize; the mip chain follows its size)
  getInputTexture(): GPUTexture;
}

// Global bloom controls, mutated by the calibration GUI (module singleton, same rule as
// tonemapSettings). Threshold is HDR luminance in linear light — the official HDR values
// (emission 8-30, eye highlight ~2.2, rim 4) are designed to feed a bloom stage.
export const bloomSettings = {
  threshold: 1.0,
  intensity: 0.15, // composite weight, applied in the tonemap pass
};

const BLOOM_MIP_LEVELS = 5;
const BLOOM_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * Bloom Pass
 *
 * Linear-light HDR bloom between the forward pass and the tonemap: prefilter extracts
 * over-threshold energy into a half-resolution mip chain, downsamples to the smallest
 * level, then tent-upsamples back with additive blending so mip 0 accumulates the widening
 * glow. The tonemap pass composites mip 0 (scaled by bloomSettings.intensity) before the
 * ACES curve. Fixed post-process pass — builds its shaders/pipelines directly, same rules
 * as TonemapPass. Renderer-private, constructor-wired.
 */
export class BloomPass {
  private pipelines?: {
    prefilter: GPURenderPipeline;
    downsample: GPURenderPipeline;
    upsample: GPURenderPipeline;
  };
  private bindGroupLayout?: GPUBindGroupLayout;
  private sampler?: GPUSampler;
  private paramsBuffer?: GPUBuffer;
  private readonly paramsData = new Float32Array(4);

  // Chain resources, rebuilt when the scene-color texture (and thus its size) changes
  private chainTexture?: GPUTexture;
  private chainSource?: GPUTexture;
  private mipViews: GPUTextureView[] = [];
  private prefilterBindGroup?: GPUBindGroup;
  private mipBindGroups: GPUBindGroup[] = [];

  constructor(private readonly deps: BloomPassDeps) {}

  /** The accumulated bloom (mip 0 view), for the tonemap composite. */
  getBloomView(): GPUTextureView {
    this.ensureResources();
    return this.mipViews[0];
  }

  execute(commandEncoder: GPUCommandEncoder): void {
    this.ensureResources();
    const { prefilter, downsample, upsample } = this.pipelines!;

    this.paramsData[0] = bloomSettings.threshold;
    this.deps.device.queue.writeBuffer(this.paramsBuffer!, 0, this.paramsData);

    const runStep = (
      pipeline: GPURenderPipeline,
      bindGroup: GPUBindGroup,
      target: GPUTextureView,
      loadOp: GPULoadOp,
    ) => {
      const pass = commandEncoder.beginRenderPass({
        label: 'bloom_pass',
        colorAttachments: [{ view: target, loadOp, storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    };

    // scene -> mip 0 (extract), walk down, then additively tent back up
    runStep(prefilter, this.prefilterBindGroup!, this.mipViews[0], 'clear');
    for (let i = 1; i < BLOOM_MIP_LEVELS; i++) {
      runStep(downsample, this.mipBindGroups[i - 1], this.mipViews[i], 'clear');
    }
    for (let i = BLOOM_MIP_LEVELS - 2; i >= 0; i--) {
      runStep(upsample, this.mipBindGroups[i + 1], this.mipViews[i], 'load');
    }
  }

  private ensureResources(): void {
    const input = this.deps.getInputTexture();
    if (this.chainTexture && this.chainSource === input) {
      return;
    }
    this.ensurePipelines();

    this.chainTexture?.destroy();
    this.chainTexture = this.deps.device.createTexture({
      label: 'bloom_chain',
      size: {
        width: Math.max(1, input.width >> 1),
        height: Math.max(1, input.height >> 1),
      },
      mipLevelCount: BLOOM_MIP_LEVELS,
      format: BLOOM_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.chainSource = input;

    this.mipViews = [];
    for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
      this.mipViews.push(this.chainTexture.createView({ baseMipLevel: i, mipLevelCount: 1 }));
    }

    const makeBindGroup = (srcView: GPUTextureView) =>
      this.deps.device.createBindGroup({
        label: 'bloom_bind_group',
        layout: this.bindGroupLayout!,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: this.sampler! },
          { binding: 2, resource: { buffer: this.paramsBuffer! } },
        ],
      });
    this.prefilterBindGroup = makeBindGroup(input.createView());
    this.mipBindGroups = this.mipViews.map((view) => makeBindGroup(view));
  }

  private ensurePipelines(): void {
    if (this.pipelines) {
      return;
    }

    const device = this.deps.device;
    const shaderModule = device.createShaderModule({
      label: 'bloom_shader',
      code: bloomShader,
    });
    this.sampler = device.createSampler({
      label: 'bloom_sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.paramsBuffer = device.createBuffer({
      label: 'bloom_params',
      size: this.paramsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'bloom_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const layout = device.createPipelineLayout({
      label: 'bloom_pipeline_layout',
      bindGroupLayouts: [this.bindGroupLayout],
    });

    const makePipeline = (entryPoint: string, blend?: GPUBlendState) =>
      device.createRenderPipeline({
        label: `bloom_${entryPoint}_pipeline`,
        layout,
        vertex: { module: shaderModule, entryPoint: 'vs_main' },
        fragment: {
          module: shaderModule,
          entryPoint,
          targets: [{ format: BLOOM_FORMAT, blend }],
        },
        primitive: { topology: 'triangle-list' },
      });

    const additive: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    };
    this.pipelines = {
      prefilter: makePipeline('fs_prefilter'),
      downsample: makePipeline('fs_downsample'),
      upsample: makePipeline('fs_upsample', additive),
    };
  }
}
