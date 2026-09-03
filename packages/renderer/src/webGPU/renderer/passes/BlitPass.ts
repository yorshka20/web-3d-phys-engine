import blitShader from '../../core/shaders/passes/blit.wgsl';
import { Inject, ServiceTokens } from '../../core/decorators';
import { WebGPUContext } from '../../core/WebGPUContext';

/** The swapchain view changes every frame. */
export interface BlitTargets {
  getOutputView(): GPUTextureView;
}

/**
 * Blit Pass
 *
 * Copies an LDR texture to the presentation target. The post chain ends on whichever
 * anti-aliasing stage is enabled; when that stage's output is not the swapchain itself (TAA
 * writes its history texture, or no AA runs at all), this pass presents it. Fixed
 * post-process pass, builds its shader/pipeline directly — same rules as TonemapPass.
 */
export class BlitPass {
  private pipeline?: GPURenderPipeline;
  private bindGroupLayout?: GPUBindGroupLayout;
  private bindGroup?: GPUBindGroup;
  private bindGroupInput?: GPUTexture;

  @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
  @Inject(ServiceTokens.WEBGPU_CONTEXT) private accessor context!: WebGPUContext;

  constructor(private readonly targets: BlitTargets) {}

  execute(commandEncoder: GPUCommandEncoder, input: GPUTexture): void {
    const pipeline = this.ensurePipeline();
    const bindGroup = this.ensureBindGroup(input);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'blit_pass',
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
      label: 'blit_shader',
      code: blitShader,
    });
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'blit_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    this.pipeline = this.device.createRenderPipeline({
      label: 'blit_pipeline',
      layout: this.device.createPipelineLayout({
        label: 'blit_pipeline_layout',
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

  private ensureBindGroup(input: GPUTexture): GPUBindGroup {
    if (this.bindGroup && this.bindGroupInput === input) {
      return this.bindGroup;
    }
    this.bindGroup = this.device.createBindGroup({
      label: 'blit_bind_group',
      layout: this.bindGroupLayout!,
      entries: [{ binding: 0, resource: input.createView() }],
    });
    this.bindGroupInput = input;
    return this.bindGroup;
  }
}
