import { Transform3DComponent } from '@ecs/components/physics/Transform3DComponent';
import { Mesh3DComponent } from '@ecs/components/physics/mesh/Mesh3DComponent';
import { System } from '@ecs/core/ecs/System';
import { World } from '@ecs/core/ecs/World';
import { mat4 } from 'gl-matrix';
import { WebGPU3DRenderComponent } from './render/WebGPU3DRenderComponent';
import { WebGPUGeometryManager } from './render/WebGPUGeometryManager';
import { WebGPUMaterialManager } from './render/WebGPUMaterialManager';

/**
 * Render batch for grouping similar objects
 */
interface RenderBatch {
  material: string; // Material ID
  geometry: string; // Geometry ID
  instances: Array<{
    entityId: number;
    transform: mat4;
    renderComponent: WebGPU3DRenderComponent;
  }>;
}

/**
 * WebGPU Render System
 *
 * This system handles the rendering of entities with WebGPU3DRenderComponent
 * and Mesh3DComponent. It manages the WebGPU rendering pipeline, resource
 * updates, and draw calls.
 */
export class WebGPURenderSystem extends System {
  private device: GPUDevice;
  private materialManager: WebGPUMaterialManager;
  private geometryManager: WebGPUGeometryManager;
  private commandEncoder: GPUCommandEncoder | null = null;
  private renderPass: GPURenderPassEncoder | null = null;

  // Render state
  private viewMatrix: mat4 = mat4.create();
  private projectionMatrix: mat4 = mat4.create();
  private viewProjectionMatrix: mat4 = mat4.create();

  // Camera uniforms
  private cameraUniformBuffer: GPUBuffer | null = null;
  private cameraBindGroup: GPUBindGroup | null = null;

  // Render batches for optimization
  private renderBatches: Map<string, RenderBatch> = new Map();

  constructor(device: GPUDevice) {
    super('WebGPURenderSystem');
    this.device = device;
    this.materialManager = new WebGPUMaterialManager(device);
    this.geometryManager = new WebGPUGeometryManager(device);
  }

  /**
   * System update method
   */
  update(world: World, deltaTime: number): void {
    // Get all entities with both WebGPU3DRenderComponent and Mesh3DComponent
    const renderEntities = world.getEntitiesWithComponents([
      'WebGPU3DRender',
      'Mesh3D',
      'Transform3D',
    ]);

    if (renderEntities.length === 0) {
      return;
    }

    // Update render batches
    this.updateRenderBatches(world, renderEntities);

    // Render all batches
    this.renderBatches();
  }

  /**
   * Update render batches based on current entities
   */
  private updateRenderBatches(world: World, entities: number[]): void {
    this.renderBatches.clear();

    for (const entityId of entities) {
      const renderComponent = world.getComponent<WebGPU3DRenderComponent>(
        entityId,
        'WebGPU3DRender',
      );
      const meshComponent = world.getComponent<Mesh3DComponent>(entityId, 'Mesh3D');
      const transformComponent = world.getComponent<Transform3DComponent>(entityId, 'Transform3D');

      if (!renderComponent || !meshComponent || !transformComponent) {
        continue;
      }

      // Skip if not visible
      if (!renderComponent.isVisible()) {
        continue;
      }

      // Create batch key
      const materialId = this.getMaterialId(renderComponent);
      const geometryId = this.getGeometryId(meshComponent);
      const batchKey = `${materialId}_${geometryId}`;

      // Get or create batch
      let batch = this.renderBatches.get(batchKey);
      if (!batch) {
        batch = {
          material: materialId,
          geometry: geometryId,
          instances: [],
        };
        this.renderBatches.set(batchKey, batch);
      }

      // Add instance to batch
      const transform = this.buildTransformMatrix(transformComponent);
      batch.instances.push({
        entityId,
        transform,
        renderComponent,
      });
    }
  }

  /**
   * Get material ID for batching
   */
  private getMaterialId(renderComponent: WebGPU3DRenderComponent): string {
    // Use a combination of material properties for batching
    const material = renderComponent.getMaterial();
    return `material_${material.albedo.r}_${material.albedo.g}_${material.albedo.b}_${material.metallic}_${material.roughness}`;
  }

  /**
   * Get geometry ID for batching
   */
  private getGeometryId(meshComponent: Mesh3DComponent): string {
    const descriptor = meshComponent.descriptor;
    return `geometry_${descriptor.type}_${JSON.stringify(descriptor.params || {})}`;
  }

  /**
   * Build transformation matrix from transform component
   */
  private buildTransformMatrix(transformComponent: Transform3DComponent): mat4 {
    const matrix = mat4.create();

    // Apply scale
    mat4.scale(matrix, matrix, transformComponent.getScale());

    // Apply rotation
    const rotation = transformComponent.getRotation();
    mat4.rotateX(matrix, matrix, rotation[0]);
    mat4.rotateY(matrix, matrix, rotation[1]);
    mat4.rotateZ(matrix, matrix, rotation[2]);

    // Apply position
    mat4.translate(matrix, matrix, transformComponent.getPosition());

    return matrix;
  }

  /**
   * Render all batches
   */
  private renderBatches(): void {
    if (this.renderBatches.size === 0) {
      return;
    }

    // Begin render pass (this should be called by the main renderer)
    if (!this.renderPass) {
      throw new Error('Render pass not started. Call beginRenderPass() first.');
    }

    // Set camera uniforms
    this.setCameraUniforms();

    // Render each batch
    for (const [batchKey, batch] of this.renderBatches) {
      this.renderBatch(batch);
    }
  }

  /**
   * Render a single batch
   */
  private renderBatch(batch: RenderBatch): void {
    // Get material and geometry
    const material = this.materialManager.getMaterial(batch.material);
    const geometry = this.geometryManager.getGeometry(batch.geometry);

    if (!material || !geometry) {
      console.warn(`Missing material or geometry for batch ${batch.material}_${batch.geometry}`);
      return;
    }

    // Set render pipeline
    if (material.renderPipeline) {
      this.renderPass!.setPipeline(material.renderPipeline);
    }

    // Set material bind group
    if (material.bindGroup) {
      this.renderPass!.setBindGroup(1, material.bindGroup);
    }

    // Set vertex buffer
    this.renderPass!.setVertexBuffer(0, geometry.vertexBuffer);

    // Set index buffer
    this.renderPass!.setIndexBuffer(geometry.indexBuffer, 'uint16');

    // Render each instance
    for (const instance of batch.instances) {
      // Update model matrix uniform
      this.updateModelMatrix(instance.transform);

      // Draw
      this.renderPass!.drawIndexed(
        geometry.indexCount,
        instance.renderComponent.getInstanceCount(),
      );
    }
  }

  /**
   * Set camera uniforms
   */
  private setCameraUniforms(): void {
    if (!this.cameraBindGroup) {
      return;
    }

    this.renderPass!.setBindGroup(0, this.cameraBindGroup);
  }

  /**
   * Update model matrix uniform
   */
  private updateModelMatrix(modelMatrix: mat4): void {
    // This would typically update a model matrix uniform buffer
    // For now, we'll assume the shader uses a global model matrix
    // In a real implementation, you'd have per-instance uniform buffers
  }

  /**
   * Begin render pass
   */
  beginRenderPass(
    commandEncoder: GPUCommandEncoder,
    renderPassDescriptor: GPURenderPassDescriptor,
  ): void {
    this.commandEncoder = commandEncoder;
    this.renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
  }

  /**
   * End render pass
   */
  endRenderPass(): void {
    if (this.renderPass) {
      this.renderPass.end();
      this.renderPass = null;
    }
  }

  /**
   * Set camera matrices
   */
  setCameraMatrices(view: mat4, projection: mat4): void {
    this.viewMatrix = mat4.clone(view);
    this.projectionMatrix = mat4.clone(projection);
    mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);

    // Update camera uniform buffer
    this.updateCameraUniforms();
  }

  /**
   * Update camera uniform buffer
   */
  private updateCameraUniforms(): void {
    if (!this.cameraUniformBuffer) {
      this.createCameraUniforms();
    }

    // Create camera uniform data
    const uniformData = new Float32Array(64); // 4x4 matrices * 4
    uniformData.set(this.viewProjectionMatrix, 0);
    uniformData.set(this.viewMatrix, 16);
    uniformData.set(this.projectionMatrix, 32);

    this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, uniformData);
  }

  /**
   * Create camera uniform buffer and bind group
   */
  private createCameraUniforms(): void {
    // Create uniform buffer
    this.cameraUniformBuffer = this.device.createBuffer({
      label: 'Camera Uniform Buffer',
      size: 192, // 3 * 4x4 matrices * 4 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Camera Bind Group Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'uniform',
          },
        },
      ],
    });

    // Create bind group
    this.cameraBindGroup = this.device.createBindGroup({
      label: 'Camera Bind Group',
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.cameraUniformBuffer,
          },
        },
      ],
    });
  }

  /**
   * Create material
   */
  async createMaterial(id: string, descriptor: any): Promise<void> {
    await this.materialManager.createMaterial(id, descriptor);
  }

  /**
   * Create geometry
   */
  createGeometry(
    id: string,
    type: keyof typeof import('@ecs/components/physics/mesh/GeometryFactory').GeometryFactory,
    options: any = {},
  ): void {
    this.geometryManager.createPrimitiveGeometry(id, type, options);
  }

  /**
   * Get material manager
   */
  getMaterialManager(): WebGPUMaterialManager {
    return this.materialManager;
  }

  /**
   * Get geometry manager
   */
  getGeometryManager(): WebGPUGeometryManager {
    return this.geometryManager;
  }

  /**
   * Get render statistics
   */
  getRenderStats(): {
    batchCount: number;
    totalInstances: number;
    materialCache: { materialCount: number; shaderCount: number };
    geometryCache: { geometryCount: number; totalMemory: number };
  } {
    let totalInstances = 0;
    for (const batch of this.renderBatches.values()) {
      totalInstances += batch.instances.length;
    }

    return {
      batchCount: this.renderBatches.size,
      totalInstances,
      materialCache: this.materialManager.getCacheStats(),
      geometryCache: this.geometryManager.getCacheStats(),
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.materialManager.clearCache();
    this.geometryManager.clearCache();

    if (this.cameraUniformBuffer) {
      this.cameraUniformBuffer.destroy();
    }
  }
}
