import { WebGPUMaterialDescriptor } from '@ecs/components/rendering/render/types';
import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { TextureManager } from './TextureManager';
import { ResourceType } from './types';

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface MaterialUniformData {
  albedo: Float32Array; // vec4
  metallic: number; // f32
  roughness: number; // f32
  emissive: Float32Array; // vec4
  emissiveIntensity: number; // f32
  uvScale: Float32Array; // vec3
  uvOffset: Float32Array; // vec3
  alphaCutoff: number; // f32
}

@Injectable(ServiceTokens.MATERIAL_MANAGER, {
  lifecycle: 'singleton',
})
export class MaterialManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.TEXTURE_MANAGER)
  private textureManager!: TextureManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  private materials: Map<string, WebGPUMaterialDescriptor> = new Map();
  private materialDescriptors: Map<string, WebGPUMaterialDescriptor> = new Map();
  private uniformBuffers: Map<string, GPUBuffer> = new Map();
  private materialBindGroups: Map<string, GPUBindGroup> = new Map();

  // Material uniform buffer size calculation
  // Based on your shader: albedo(16) + metallic(4) + roughness(4) + padding(8) + emissive(16) + emissiveIntensity(4) + padding(12) = 64 bytes
  private readonly MATERIAL_UNIFORM_SIZE = 64;

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    // Create default material
    this.createMaterial('default', {
      albedo: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
      metallic: 0.0,
      roughness: 0.5,
      emissive: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      emissiveIntensity: 1.0,
      uvScale: [1.0, 1.0, 1.0],
      uvOffset: [0.0, 0.0, 0.0],
      alphaMode: 'opaque',
      alphaCutoff: 0.5,
      doubleSided: false,
      // WebGPU specific properties
      uniformBufferId: 'default_uniform',
      bindGroupId: 'default_bindgroup',
      materialType: 'normal',
    });

    // Create water material example
    this.createMaterial('water', {
      albedo: { r: 0.2, g: 0.6, b: 1.0, a: 0.8 },
      metallic: 0.0,
      roughness: 0.1,
      emissive: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      emissiveIntensity: 0.0,
      albedoTexture: 'water_texture',
      alphaMode: 'blend',
      uvScale: [2.0, 2.0, 1.0],
      uvOffset: [0.0, 0.0, 0.0],
      alphaCutoff: 0.5,
      doubleSided: false,
      // WebGPU specific properties
      uniformBufferId: 'water_uniform',
      bindGroupId: 'water_bindgroup',
      albedoTextureId: 'water_texture',
      materialType: 'normal',
    });
  }

  getMaterial(id: string): WebGPUMaterialDescriptor | undefined {
    return this.materials.get(id);
  }

  getMaterialDescriptor(id: string): WebGPUMaterialDescriptor | undefined {
    return this.materialDescriptors.get(id);
  }

  @SmartResource(ResourceType.BUFFER, {
    lifecycle: 'persistent',
    cache: true,
  })
  createMaterial(id: string, material: WebGPUMaterialDescriptor): WebGPUMaterialDescriptor {
    // Check if material already exists
    if (this.materials.has(id)) {
      console.log(`Material ${id} already exists, returning existing descriptor`);
      return this.materialDescriptors.get(id)!;
    }

    // Store material
    this.materials.set(id, material);

    // Create uniform buffer for this material
    const uniformBuffer = this.device.createBuffer({
      size: this.MATERIAL_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `material_${id}_uniform`,
    });

    this.uniformBuffers.set(id, uniformBuffer);

    // Create material descriptor
    const descriptor: WebGPUMaterialDescriptor = {
      ...material,
      uniformBufferId: `material_${id}_uniform`,
      bindGroupId: `material_${id}_bindgroup`,
      // Texture IDs will be resolved when needed
      albedoTextureId: material.albedoTexture,
      normalTextureId: material.normalTexture,
      metallicRoughnessTextureId: material.metallicRoughnessTexture,
      emissiveTextureId: material.emissiveTexture,
    };

    this.materialDescriptors.set(id, descriptor);

    // Update uniform buffer with material data
    this.updateMaterialUniform(id);

    console.log(`Created material: ${id}`);
    return descriptor;
  }

  updateMaterial(id: string, updates: Partial<WebGPUMaterialDescriptor>): void {
    const material = this.materials.get(id);
    if (!material) {
      throw new Error(`Material ${id} not found`);
    }

    // Update material properties
    Object.assign(material, updates);

    // Update uniform buffer
    this.updateMaterialUniform(id);
  }

  private updateMaterialUniform(id: string): void {
    const material = this.materials.get(id);
    const uniformBuffer = this.uniformBuffers.get(id);

    if (!material) {
      console.warn(`Material ${id} not found for uniform update`);
      return;
    }

    if (!uniformBuffer) {
      console.warn(`Uniform buffer for material ${id} not found`);
      return;
    }

    const uniformData = this.createMaterialUniformData(material);
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);
  }

  private createMaterialUniformData(material: WebGPUMaterialDescriptor): Float32Array {
    // Create uniform data matching shader layout
    const data = new Float32Array(16); // 64 bytes / 4 = 16 floats

    let offset = 0;

    // albedo (vec4) - 16 bytes
    data[offset++] = material.albedo.r;
    data[offset++] = material.albedo.g;
    data[offset++] = material.albedo.b;
    data[offset++] = material.albedo.a;

    // metallic (f32) - 4 bytes
    data[offset++] = material.metallic;

    // roughness (f32) - 4 bytes
    data[offset++] = material.roughness;

    // padding to align to next vec4 (8 bytes)
    data[offset++] = 0.0;
    data[offset++] = 0.0;

    // emissive (vec4) - 16 bytes
    data[offset++] = material.emissive.r;
    data[offset++] = material.emissive.g;
    data[offset++] = material.emissive.b;
    data[offset++] = material.emissive.a;

    // emissiveIntensity (f32) - 4 bytes
    data[offset++] = material.emissiveIntensity;

    // padding to complete 64 bytes (12 bytes)
    data[offset++] = 0.0;
    data[offset++] = 0.0;
    data[offset++] = 0.0;

    return data;
  }

  getUniformBuffer(materialId: string): GPUBuffer | undefined {
    return this.uniformBuffers.get(materialId);
  }

  /**
   * Create or get material bind group for rendering
   * @param materialId Material ID
   * @param material Material data
   * @param bindGroupLayout Bind group layout
   * @returns Material bind group
   */
  createMaterialBindGroup(
    materialId: string,
    material: WebGPUMaterialDescriptor,
    bindGroupLayout: GPUBindGroupLayout,
  ): GPUBindGroup {
    const bindGroupId = `material_${materialId}_bindgroup`;

    // Check if bind group already exists
    if (this.materialBindGroups.has(bindGroupId)) {
      return this.materialBindGroups.get(bindGroupId)!;
    }

    // Ensure material is registered first
    if (!this.materials.has(materialId)) {
      this.materials.set(materialId, material);
      console.log(`Registered material ${materialId} during bind group creation`);
    }

    // Get or create uniform buffer for this material
    let uniformBuffer = this.uniformBuffers.get(materialId);
    if (!uniformBuffer) {
      // Create uniform buffer if it doesn't exist
      const bufferSize = this.MATERIAL_UNIFORM_SIZE;
      console.log(
        `Creating uniform buffer for material ${materialId}, size: ${bufferSize}, type: ${typeof bufferSize}`,
      );

      if (bufferSize === undefined || bufferSize === null || isNaN(bufferSize)) {
        throw new Error(`Invalid buffer size: ${bufferSize} for material ${materialId}`);
      }

      uniformBuffer = this.device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: `material_${materialId}_uniform`,
      });
      this.uniformBuffers.set(materialId, uniformBuffer);
    }

    // Update uniform buffer with current material data
    this.updateMaterialUniform(materialId);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
      ],
      label: bindGroupId,
    });

    this.materialBindGroups.set(bindGroupId, bindGroup);
    console.log(`Created material bind group: ${bindGroupId}`);

    return bindGroup;
  }

  /**
   * Get material bind group by ID
   * @param materialId Material ID
   * @returns Material bind group or undefined
   */
  getMaterialBindGroup(materialId: string): GPUBindGroup | undefined {
    const bindGroupId = `material_${materialId}_bindgroup`;
    return this.materialBindGroups.get(bindGroupId);
  }

  deleteMaterial(id: string): void {
    // Clean up uniform buffer
    const uniformBuffer = this.uniformBuffers.get(id);
    if (uniformBuffer) {
      uniformBuffer.destroy();
      this.uniformBuffers.delete(id);
    }

    // Clean up bind group
    const bindGroupId = `material_${id}_bindgroup`;
    const bindGroup = this.materialBindGroups.get(bindGroupId);
    if (bindGroup) {
      // GPUBindGroup doesn't have destroy method, just remove from map
      this.materialBindGroups.delete(bindGroupId);
    }

    // Remove from maps
    this.materials.delete(id);
    this.materialDescriptors.delete(id);

    console.log(`Deleted material: ${id}`);
  }

  // Helper method to get texture for material
  getTextureForMaterial(
    materialId: string,
    textureType: 'albedo' | 'normal' | 'metallicRoughness' | 'emissive',
  ): GPUTexture | undefined {
    const material = this.materials.get(materialId);
    if (!material) return undefined;

    let textureId: string | undefined;
    switch (textureType) {
      case 'albedo':
        textureId = material.albedoTexture;
        break;
      case 'normal':
        textureId = material.normalTexture;
        break;
      case 'metallicRoughness':
        textureId = material.metallicRoughnessTexture;
        break;
      case 'emissive':
        textureId = material.emissiveTexture;
        break;
    }

    if (!textureId) return undefined;

    // Assuming TextureManager has a public getTexture method
    // You might need to add this to your TextureManager
    return this.textureManager.getTexture(textureId);
  }

  /**
   * Get material statistics
   */
  getMaterialStats(): {
    totalMaterials: number;
    totalUniformBuffers: number;
    totalBindGroups: number;
    memoryUsage: number;
  } {
    const totalUniformBuffers = this.uniformBuffers.size;
    const totalBindGroups = this.materialBindGroups.size;
    const memoryUsage = totalUniformBuffers * this.MATERIAL_UNIFORM_SIZE;

    return {
      totalMaterials: this.materials.size,
      totalUniformBuffers,
      totalBindGroups,
      memoryUsage,
    };
  }

  onDestroy(): void {
    // Destroy all uniform buffers
    for (const buffer of this.uniformBuffers.values()) {
      buffer.destroy();
    }

    // Clear all maps
    this.materials.clear();
    this.materialDescriptors.clear();
    this.uniformBuffers.clear();
    this.materialBindGroups.clear();

    console.log('MaterialManager destroyed');
  }
}
