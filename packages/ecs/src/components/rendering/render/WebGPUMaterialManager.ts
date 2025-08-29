import { Color } from '@ecs/types/types';
import { WebGPUMaterialDescriptor } from './types';

/**
 * WebGPU Material Manager
 *
 * Handles material descriptor management and validation.
 * Actual WebGPU resource creation is handled by the renderer package.
 * This class focuses on material property management and caching.
 */
export class WebGPUMaterialManager {
  private materialCache: Map<string, WebGPUMaterialDescriptor> = new Map();

  constructor() {
    // No device dependency - resources created by renderer
  }

  /**
   * Create a material descriptor from properties
   */
  createMaterialDescriptor(
    id: string,
    descriptor: {
      albedo?: Color;
      metallic?: number;
      roughness?: number;
      emissive?: Color;
      emissiveIntensity?: number;
      textures?: {
        albedo?: string;
        normal?: string;
        metallicRoughness?: string;
        emissive?: string;
      };
      shaderId?: string;
      uniformBufferId?: string;
      bindGroupId?: string;
      renderPipelineId?: string;
    },
  ): WebGPUMaterialDescriptor {
    // Check cache first
    if (this.materialCache.has(id)) {
      return this.materialCache.get(id)!;
    }

    const material: WebGPUMaterialDescriptor = {
      albedo: descriptor.albedo ?? { r: 1, g: 1, b: 1, a: 1 },
      metallic: descriptor.metallic ?? 0,
      roughness: descriptor.roughness ?? 0.5,
      emissive: descriptor.emissive ?? { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: descriptor.emissiveIntensity ?? 0,
      doubleSided: false,
      primitiveTopology: 'triangle-list',
      cullMode: 'back',
      frontFace: 'ccw',

      // Resource IDs (to be set by renderer)
      shaderId: descriptor.shaderId,
      uniformBufferId: descriptor.uniformBufferId,
      bindGroupId: descriptor.bindGroupId,
      renderPipelineId: descriptor.renderPipelineId,

      // Texture IDs
      albedoTextureId: descriptor.textures?.albedo,
      normalTextureId: descriptor.textures?.normal,
      metallicRoughnessTextureId: descriptor.textures?.metallicRoughness,
      emissiveTextureId: descriptor.textures?.emissive,
    };

    // Cache the material descriptor
    this.materialCache.set(id, material);

    return material;
  }

  /**
   * Get material uniform data for buffer updates
   */
  getMaterialUniformData(material: WebGPUMaterialDescriptor): Float32Array {
    return new Float32Array([
      // Albedo (4 floats)
      material.albedo.r,
      material.albedo.g,
      material.albedo.b,
      material.albedo.a,
      // Metallic, Roughness, EmissiveIntensity, padding (4 floats)
      material.metallic,
      material.roughness,
      material.emissiveIntensity,
      0, // padding
      // Emissive (4 floats)
      material.emissive.r,
      material.emissive.g,
      material.emissive.b,
      material.emissive.a,
    ]);
  }

  /**
   * Update material properties
   */
  updateMaterial(id: string, updates: Partial<WebGPUMaterialDescriptor>): void {
    const material = this.materialCache.get(id);
    if (!material) {
      throw new Error(`Material ${id} not found`);
    }

    // Update properties
    Object.assign(material, updates);
  }

  /**
   * Get cached material descriptor
   */
  getMaterial(id: string): WebGPUMaterialDescriptor | undefined {
    return this.materialCache.get(id);
  }

  /**
   * Remove material from cache
   */
  removeMaterial(id: string): void {
    this.materialCache.delete(id);
  }

  /**
   * Clear all cached materials
   */
  clearCache(): void {
    this.materialCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { materialCount: number } {
    return {
      materialCount: this.materialCache.size,
    };
  }

  /**
   * Check if material exists in cache
   */
  hasMaterial(id: string): boolean {
    return this.materialCache.has(id);
  }

  /**
   * Get all material IDs
   */
  getMaterialIds(): string[] {
    return Array.from(this.materialCache.keys());
  }
}
