import bloomShader from '../../core/shaders/passes/bloom.wgsl';
import bloomThresholdShader from '../../core/shaders/passes/bloom_threshold.wgsl';
import { Inject, ServiceTokens } from '../../core/decorators';
import { sceneSettings } from '../sceneSettings';

// Global bloom controls, mutated by the calibration GUI (module singleton, same rule as
// tonemapSettings). The chain is the game's (hgrp-decompiled-formulas.md §15), whose values
// live in a scene post-processing volume the rip does not carry (guess ledger A3): thresholds
// are brightness of the EXPOSED linear scene color (the game thresholds its pre-exposed
// target, so 1.0 is the curve's shoulder whatever the exposure), the rest are the shader's
// own parameters, at URP's defaults where the game's are unknown.
export const bloomSettings = {
  // Scene threshold, the brightest channel above which a pixel starts to bloom. URP's
  // default is 0.9 in gamma, 0.787 linear.
  threshold: 0.787,
  // Character pixels (the stencil groups) bloom by a per-channel subtraction of this threshold
  // scaled by characterIntensity, instead of the scene's knee-scaled extraction.
  characterThreshold: 0.787,
  characterIntensity: 1.0,
  // The upsample blend toward the coarser level (_Params.x): higher scatters the glow wider.
  // URP maps its 0..1 slider to 0.05..0.95 and defaults to 0.7, which is 0.68 here.
  scatter: 0.68,
  // Composite (_BloomParams): x is the lerp weight from the scene toward the bloomed scene,
  // subtract the share of the extracted energy taken back out of the scene so the glow
  // replaces the highlight it came from (0 = classic additive, 1 = energy-conserving).
  intensity: 1.0,
  subtract: 0.0,
  tint: [1.0, 1.0, 1.0] as [number, number, number],
  // Levels of the half-resolution chain, capped by the size (URP's maxIterations default)
  maxIterations: 6,
};

// Half-resolution chain (URP's Half downscale), rgba16float like the scene color
const BLOOM_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * The game's _BloomThreshold packing: (threshold, threshold - knee, 2 knee, 0.25 / knee), the
 * knee half the threshold (URP hardcodes the soft knee). Written into `out` at `offset`.
 */
export function packBloomThreshold(threshold: number, out: Float32Array, offset: number): void {
  const knee = Math.max(threshold * 0.5, 1e-4);
  out[offset] = threshold;
  out[offset + 1] = threshold - knee;
  out[offset + 2] = knee * 2;
  out[offset + 3] = 0.25 / knee;
}

/** URP's level count: floor(log2(max side)) - 1 of the half-res chain, capped by the setting. */
function bloomMipCount(width: number, height: number): number {
  const iterations = Math.floor(Math.log2(Math.max(width, height))) - 1;
  return Math.max(1, Math.min(iterations, bloomSettings.maxIterations));
}

/**
 * Both renderer-owned and recreated on resize: the HDR scene-color texture the chain reads,
 * and the forward pass's depth-stencil attachment whose stencil aspect marks character pixels.
 */
export interface BloomTargets {
  getInputTexture(): GPUTexture;
  getDepthStencilTexture(): GPUTexture;
}

/**
 * Bloom Pass
 *
 * The game's bloom (URP's chain with a character prefilter branch), in linear light between
 * the forward pass and the tonemap: prefilter extracts over-threshold energy into a
 * half-resolution "down" chain, each level is halved with a separable Gaussian (the "up"
 * chain's level serving as the scratch between the two blurs), then the levels are blended
 * back up coarse-to-fine into the up chain, whose mip 0 the tonemap composites. Fixed
 * post-process pass — builds its shaders/pipelines directly, same rules as TonemapPass.
 * Renderer-private, constructor-wired.
 */
export class BloomPass {
  private pipelines?: {
    prefilter: GPURenderPipeline;
    blurH: GPURenderPipeline;
    blurV: GPURenderPipeline;
    upsample: GPURenderPipeline;
  };
  private layouts?: {
    prefilter: GPUBindGroupLayout;
    blur: GPUBindGroupLayout;
    upsample: GPUBindGroupLayout;
  };
  private sampler?: GPUSampler;
  private paramsBuffer?: GPUBuffer;
  private readonly paramsData = new Float32Array(12);

  // Chain resources, rebuilt when the scene-color / depth textures change or the level count
  // the settings ask for does
  private downChain?: GPUTexture;
  private upChain?: GPUTexture;
  private chainSource?: GPUTexture;
  private chainMask?: GPUTexture;
  private chainMipCount = 0;
  private downViews: GPUTextureView[] = [];
  private upViews: GPUTextureView[] = [];
  private prefilterBindGroup?: GPUBindGroup;
  private blurHBindGroups: GPUBindGroup[] = [];
  private blurVBindGroups: GPUBindGroup[] = [];
  private upsampleBindGroups: GPUBindGroup[] = [];

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;

  constructor(private readonly targets: BloomTargets) {}

  /** The blended bloom (up chain mip 0, half resolution), for the tonemap composite. */
  getBloomView(): GPUTextureView {
    this.ensureResources();
    // A one-level chain has nothing to blend up: the prefilter output is the bloom
    return this.chainMipCount > 1 ? this.upViews[0] : this.downViews[0];
  }

  execute(commandEncoder: GPUCommandEncoder): void {
    this.ensureResources();
    const { prefilter, blurH, blurV, upsample } = this.pipelines!;

    packBloomThreshold(bloomSettings.threshold, this.paramsData, 0);
    packBloomThreshold(bloomSettings.characterThreshold, this.paramsData, 4);
    this.paramsData[8] = bloomSettings.characterIntensity;
    this.paramsData[9] = bloomSettings.scatter;
    this.paramsData[10] = sceneSettings.exposure;
    this.device.queue.writeBuffer(this.paramsBuffer!, 0, this.paramsData);

    const runStep = (
      pipeline: GPURenderPipeline,
      bindGroup: GPUBindGroup,
      target: GPUTextureView,
    ) => {
      const pass = commandEncoder.beginRenderPass({
        label: 'bloom_pass',
        colorAttachments: [
          { view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    };

    const mipCount = this.chainMipCount;
    // scene -> down[0]; each coarser level: blur H halves down[i-1] into the scratch up[i],
    // blur V settles it into down[i]
    runStep(prefilter, this.prefilterBindGroup!, this.downViews[0]);
    for (let i = 1; i < mipCount; i++) {
      runStep(blurH, this.blurHBindGroups[i], this.upViews[i]);
      runStep(blurV, this.blurVBindGroups[i], this.downViews[i]);
    }
    // coarse to fine: up[i] = mix(down[i], coarser, scatter), the coarsest coarser being
    // down[N-1] itself (no up level was blended there)
    for (let i = mipCount - 2; i >= 0; i--) {
      runStep(upsample, this.upsampleBindGroups[i], this.upViews[i]);
    }
  }

  private ensureResources(): void {
    const input = this.targets.getInputTexture();
    const mask = this.targets.getDepthStencilTexture();
    const width = Math.max(1, input.width >> 1);
    const height = Math.max(1, input.height >> 1);
    const mipCount = bloomMipCount(width, height);
    if (
      this.downChain &&
      this.chainSource === input &&
      this.chainMask === mask &&
      this.chainMipCount === mipCount
    ) {
      return;
    }
    this.ensurePipelines();

    this.downChain?.destroy();
    this.upChain?.destroy();
    const createChain = (label: string) =>
      this.device.createTexture({
        label,
        size: { width, height },
        mipLevelCount: mipCount,
        format: BLOOM_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.downChain = createChain('bloom_chain_down');
    this.upChain = createChain('bloom_chain_up');
    this.chainSource = input;
    this.chainMask = mask;
    this.chainMipCount = mipCount;

    const levelViews = (texture: GPUTexture) =>
      Array.from({ length: mipCount }, (_, i) =>
        texture.createView({ baseMipLevel: i, mipLevelCount: 1 }),
      );
    this.downViews = levelViews(this.downChain);
    this.upViews = levelViews(this.upChain);

    const { prefilter, blur, upsample } = this.layouts!;
    const common = (src: GPUTextureView): GPUBindGroupEntry[] => [
      { binding: 0, resource: src },
      { binding: 1, resource: this.sampler! },
      { binding: 2, resource: { buffer: this.paramsBuffer! } },
    ];
    this.prefilterBindGroup = this.device.createBindGroup({
      label: 'bloom_prefilter_bind_group',
      layout: prefilter,
      entries: [
        ...common(input.createView()),
        { binding: 3, resource: mask.createView({ aspect: 'stencil-only' }) },
      ],
    });
    const blurBindGroup = (src: GPUTextureView) =>
      this.device.createBindGroup({
        label: 'bloom_blur_bind_group',
        layout: blur,
        entries: common(src),
      });
    // Indexed by the level written, filled for the levels execute() visits: blur H reads the
    // finer down level into the scratch up level, blur V reads that scratch back; upsample
    // reads the coarser level (down for the coarsest pair, up below it) over its own down level
    this.blurHBindGroups = [];
    this.blurVBindGroups = [];
    this.upsampleBindGroups = [];
    for (let i = 1; i < mipCount; i++) {
      this.blurHBindGroups[i] = blurBindGroup(this.downViews[i - 1]);
      this.blurVBindGroups[i] = blurBindGroup(this.upViews[i]);
    }
    for (let i = mipCount - 2; i >= 0; i--) {
      const coarser = i === mipCount - 2 ? this.downViews[i + 1] : this.upViews[i + 1];
      this.upsampleBindGroups[i] = this.device.createBindGroup({
        label: 'bloom_upsample_bind_group',
        layout: upsample,
        entries: [...common(coarser), { binding: 4, resource: this.downViews[i] }],
      });
    }
  }

  private ensurePipelines(): void {
    if (this.pipelines) {
      return;
    }

    const device = this.device;
    const shaderModule = device.createShaderModule({
      label: 'bloom_shader',
      code: bloomThresholdShader + bloomShader,
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

    const common: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ];
    const makeLayout = (label: string, extra: GPUBindGroupLayoutEntry[]) =>
      device.createBindGroupLayout({ label, entries: [...common, ...extra] });
    this.layouts = {
      prefilter: makeLayout('bloom_prefilter_layout', [
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'uint' } },
      ]),
      blur: makeLayout('bloom_blur_layout', []),
      upsample: makeLayout('bloom_upsample_layout', [
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ]),
    };

    const makePipeline = (entryPoint: string, bindGroupLayout: GPUBindGroupLayout) =>
      device.createRenderPipeline({
        label: `bloom_${entryPoint}_pipeline`,
        layout: device.createPipelineLayout({
          label: `bloom_${entryPoint}_layout`,
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: { module: shaderModule, entryPoint: 'vs_main' },
        fragment: {
          module: shaderModule,
          entryPoint,
          targets: [{ format: BLOOM_FORMAT }],
        },
        primitive: { topology: 'triangle-list' },
      });

    this.pipelines = {
      prefilter: makePipeline('fs_prefilter', this.layouts.prefilter),
      blurH: makePipeline('fs_blur_h', this.layouts.blur),
      blurV: makePipeline('fs_blur_v', this.layouts.blur),
      upsample: makePipeline('fs_upsample', this.layouts.upsample),
    };
  }
}
