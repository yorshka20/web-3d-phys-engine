import { Inject, Injectable, ServiceTokens } from './decorators';
import { ShaderManager } from './ShaderManager';

/**
 * Manages the creation, storage, and retrieval of WebGPU render pipelines.
 * This class acts as a central registry for all render pipelines, allowing
 * different rendering tasks to register and retrieve their specific pipelines
 * by a unique identifier.
 */
@Injectable(ServiceTokens.RENDER_PIPELINE_MANAGER, {
  lifecycle: 'singleton',
})
export class RenderPipelineManager {
  @Inject(ServiceTokens.SHADER_MANAGER)
  private shaderManager!: ShaderManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  private pipelines: Map<string, GPURenderPipeline> = new Map();

  /**
   * Registers a new render pipeline with a given ID.
   * @param id A unique identifier for the pipeline.
   * @param pipeline The GPURenderPipeline object to register.
   */
  registerPipeline(id: string, pipeline: GPURenderPipeline): void {
    if (this.pipelines.has(id)) {
      console.warn(`Pipeline with ID '${id}' already registered. Overwriting.`);
    }
    this.pipelines.set(id, pipeline);
    console.log(`Render pipeline '${id}' registered.`);
  }

  /**
   * Retrieves a registered render pipeline by its ID.
   * @param id The unique identifier of the pipeline.
   * @returns The GPURenderPipeline object, or undefined if not found.
   */
  getPipeline(id: string): GPURenderPipeline | undefined {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) {
      console.warn(`Render pipeline with ID '${id}' not found.`);
    }
    return pipeline;
  }

  /**
   * Destroys all registered pipelines. Note: WebGPU pipelines do not have an explicit destroy method,
   * but this method can be used for cleanup logic if any is added in the future.
   */
  destroy(): void {
    this.pipelines.clear();
    console.log('RenderPipelineManager destroyed and all pipelines cleared.');
  }
}
