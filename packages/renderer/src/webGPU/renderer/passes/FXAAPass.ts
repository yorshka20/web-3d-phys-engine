import fxaaShader from '../../core/shaders/passes/fxaa.wgsl';
import { Inject, ServiceTokens } from '../../core/decorators';
import { WebGPUContext } from '../../core/WebGPUContext';

export interface FXAATargets {
  getInputTexture(): GPUTexture;
  getOutputView(): GPUTextureView;
}

/**
 * FXAA Pass
 *
 * Final anti-aliasing resolve over the tonemap's ENCODED LDR output, written to the
 * swapchain's plain (non-sRGB) view — values are already encoded, a second encode would
 * wash the image. Fixed post-process pass, builds its shader/pipeline directly — same
 * rules as TonemapPass. Renderer-private, constructor-wired.
 */
export class FXAAPass {
  private pipeline?: GPURenderPipeline;
  private bindGroupLayout?: GPUBindGroupLayout;
  private bindGroup?: GPUBindGroup;
  private bindGroupInput?: GPUTexture;
  private sampler?: GPUSampler;

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
  @Inject(ServiceTokens.WEBGPU_CONTEXT) private accessor context!: WebGPUContext;

  /**
   * The LDR input is recreated on resize and the swapchain view changes every frame, so both
   * arrive as closures. The output format comes from the context, which owns it.
   */
  constructor(private readonly targets: FXAATargets) {}

  execute(commandEncoder: GPUCommandEncoder): void {
    const pipeline = this.ensurePipeline();
    const bindGroup = this.ensureBindGroup();

    const renderPass = commandEncoder.beginRenderPass({
      label: 'fxaa_pass',
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
      label: 'fxaa_shader',
      code: fxaaShader,
    });
    this.sampler = this.device.createSampler({
      label: 'fxaa_sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'fxaa_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'fxaa_pipeline',
      layout: this.device.createPipelineLayout({
        label: 'fxaa_pipeline_layout',
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

  private ensureBindGroup(): GPUBindGroup {
    const input = this.targets.getInputTexture();
    if (this.bindGroup && this.bindGroupInput === input) {
      return this.bindGroup;
    }

    this.bindGroup = this.device.createBindGroup({
      label: 'fxaa_bind_group',
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: this.sampler! },
      ],
    });
    this.bindGroupInput = input;
    return this.bindGroup;
  }
}
