/**
 * PMX Asset Registry - Centralized PMX model asset management
 * Provides centralized PMX model asset management with explicit texture mapping support
 */

import { AssetDescriptorValidator, PMXAssetDescriptor } from './PMXAssetDescriptor';

/**
 * PMX asset registration manager
 * Unified management of all PMX model asset descriptors to avoid conflicts
 */
export class PMXAssetRegistry {
  private descriptors = new Map<string, PMXAssetDescriptor>();
  private texturePathCache = new Map<string, string>(); // Texture path cache

  /**
   * Register PMX model asset descriptor
   * @param descriptor Asset descriptor
   * @throws Error if model ID already exists or descriptor is invalid
   */
  register(descriptor: PMXAssetDescriptor): void {
    // Validate descriptor
    const validation = AssetDescriptorValidator.validate(descriptor);
    if (!validation.isValid) {
      throw new Error(
        `Invalid asset descriptor for ${descriptor.modelId}: ${validation.errors.join(', ')}`,
      );
    }

    // Check if already exists
    if (this.descriptors.has(descriptor.modelId)) {
      throw new Error(`Model ${descriptor.modelId} already registered`);
    }

    // Register descriptor
    this.descriptors.set(descriptor.modelId, descriptor);

    // Build texture path cache
    this.buildTexturePathCache(descriptor);

    console.log(`[PMXAssetRegistry] Registered model: ${descriptor.modelId}`);
  }

  /**
   * Get model asset descriptor
   * @param modelId Model ID
   * @returns Asset descriptor or null
   */
  getDescriptor(modelId: string): PMXAssetDescriptor | null {
    return this.descriptors.get(modelId) || null;
  }

  /**
   * Resolve texture path with namespace isolation
   * @param modelId Model ID
   * @param materialIndex Material index
   * @param textureType Texture type
   * @returns Namespaced texture path or null
   */
  resolveTexturePath(modelId: string, materialIndex: number, textureType: string): string | null {
    const descriptor = this.getDescriptor(modelId);
    if (!descriptor) {
      console.warn(`[PMXAssetRegistry] Model not found: ${modelId}`);
      return null;
    }

    const materialDef = descriptor.materialDefinitions[materialIndex];
    if (!materialDef) {
      console.warn(`[PMXAssetRegistry] Material ${materialIndex} not found for model ${modelId}`);
      return null;
    }

    const relativePath = materialDef.textures[textureType as keyof typeof materialDef.textures];
    if (!relativePath) {
      return null;
    }

    // Return namespaced path instead of full path
    return this.createNamespacedTexturePath(modelId, relativePath);
  }

  /**
   * Get all texture paths for a model with namespace isolation
   * @param modelId Model ID
   * @returns Array of namespaced texture paths
   */
  getAllTexturePaths(modelId: string): string[] {
    const descriptor = this.getDescriptor(modelId);
    if (!descriptor) {
      return [];
    }

    const texturePaths = new Set<string>();

    // Collect material textures with namespace isolation
    for (const materialDef of Object.values(descriptor.materialDefinitions)) {
      for (const texturePath of Object.values(materialDef.textures)) {
        if (texturePath) {
          const namespacedPath = this.createNamespacedTexturePath(modelId, texturePath);
          texturePaths.add(namespacedPath);
        }
      }
    }

    // Collect shared textures with namespace isolation
    if (descriptor.sharedTextures) {
      for (const textureList of Object.values(descriptor.sharedTextures)) {
        if (Array.isArray(textureList)) {
          for (const texturePath of textureList) {
            const namespacedPath = this.createNamespacedTexturePath(modelId, texturePath);
            texturePaths.add(namespacedPath);
          }
        }
      }
    }

    return Array.from(texturePaths);
  }

  /**
   * Get texture URL for a specific texture path
   * @param modelId Model ID
   * @param texturePath Texture path (relative path without textureBasePath)
   * @returns Texture URL or null
   */
  getTextureUrl(modelId: string, texturePath: string): string | null {
    const descriptor = this.getDescriptor(modelId);
    if (!descriptor || !descriptor.textureUrlMap) {
      console.warn(`[PMXAssetRegistry] No descriptor or textureUrlMap for model: ${modelId}`);
      return null;
    }

    const url = descriptor.textureUrlMap[texturePath] || null;

    if (!url) {
      console.warn(`[PMXAssetRegistry] No URL found for texture: ${texturePath}`);
    }

    return url;
  }

  /**
   * Create namespaced texture path to avoid conflicts between models
   * @param modelId Model ID
   * @param texturePath Original texture path
   * @returns Namespaced texture path
   */
  private createNamespacedTexturePath(modelId: string, texturePath: string): string {
    // Create namespace-isolated path: modelId/texturePath
    // Add textures/ prefix to match descriptor format
    return `${modelId}/${texturePath}`;
  }

  /**
   * Get namespaced texture path for a specific model and texture
   * @param modelId Model ID
   * @param texturePath Original texture path
   * @returns Namespaced texture path
   */
  getNamespacedTexturePath(modelId: string, texturePath: string): string {
    return this.createNamespacedTexturePath(modelId, texturePath);
  }

  /**
   * Get material definitions for a model
   * @param modelId Model ID
   * @returns Material definition mapping
   */
  getMaterialDefinitions(modelId: string): {
    [materialName: string]: { textures: Record<string, string | undefined> };
  } | null {
    const descriptor = this.getDescriptor(modelId);
    return descriptor?.materialDefinitions || null;
  }

  /**
   * Check if model is registered
   * @param modelId Model ID
   * @returns Whether model is registered
   */
  isRegistered(modelId: string): boolean {
    return this.descriptors.has(modelId);
  }

  /**
   * Get all registered model IDs
   * @returns Array of model IDs
   */
  getAllModelIds(): string[] {
    return Array.from(this.descriptors.keys());
  }

  /**
   * Unregister model
   * @param modelId Model ID
   * @returns Whether successfully unregistered
   */
  unregister(modelId: string): boolean {
    const removed = this.descriptors.delete(modelId);
    if (removed) {
      // Clear related cache
      this.clearTexturePathCache(modelId);
      console.log(`[PMXAssetRegistry] Unregistered model: ${modelId}`);
    }
    return removed;
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.descriptors.clear();
    this.texturePathCache.clear();
    console.log('[PMXAssetRegistry] Cleared all registrations');
  }

  /**
   * Get registration statistics
   * @returns Statistics
   */
  getStats(): {
    modelCount: number;
    totalMaterials: number;
    totalTextures: number;
  } {
    let totalMaterials = 0;
    let totalTextures = 0;

    for (const descriptor of this.descriptors.values()) {
      totalMaterials += Object.keys(descriptor.materialDefinitions).length;
      totalTextures += this.getAllTexturePaths(descriptor.modelId).length;
    }

    return {
      modelCount: this.descriptors.size,
      totalMaterials,
      totalTextures,
    };
  }

  /**
   * Build texture path cache
   * @param descriptor Asset descriptor
   */
  private buildTexturePathCache(descriptor: PMXAssetDescriptor): void {
    const texturePaths = this.getAllTexturePaths(descriptor.modelId);
    for (const path of texturePaths) {
      this.texturePathCache.set(path, descriptor.modelId);
    }
  }

  /**
   * Clear texture path cache for specific model
   * @param modelId Model ID
   */
  private clearTexturePathCache(modelId: string): void {
    for (const [path, cachedModelId] of this.texturePathCache.entries()) {
      if (cachedModelId === modelId) {
        this.texturePathCache.delete(path);
      }
    }
  }
}

// Global PMX asset registry instance
export const pmxAssetRegistry = new PMXAssetRegistry();
