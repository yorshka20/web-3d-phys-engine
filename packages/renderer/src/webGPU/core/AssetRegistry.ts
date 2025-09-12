/**
 * Asset Registry - Centralized CPU resource management
 * Manages loaded assets in CPU memory and their references
 * This follows the design principle of separating asset loading from GPU resource creation
 */

import { AssetLoader } from './AssetLoader';

export interface AssetDescriptor {
  id: string;
  type: AssetType;
  cpuData: unknown; // Raw parsed data
  gpuHandle: unknown | null; // GPU resource handle (created lazily)
  refCount: number; // ECS component reference count
  lastAccess: number; // LRU management
  memorySize: number; // CPU memory usage
  dependencies: string[]; // Asset dependencies
  loadTime: number;
}

export type AssetType = 'mesh' | 'texture' | 'material' | 'pmx_model' | 'geometry';

export interface AssetMetadata {
  type: AssetType;
  dependencies: string[];
  memorySize?: number;
}

/**
 * Asset Registry - Manages CPU resources and their lifecycle
 */
export class AssetRegistry {
  private assets: Map<string, AssetDescriptor> = new Map();
  private dependencyGraph: Map<string, string[]> = new Map();
  private memoryUsage: number = 0;

  /**
   * Register a loaded asset
   */
  register(assetId: string, parsedData: unknown, metadata: AssetMetadata): AssetDescriptor {
    const memorySize = metadata.memorySize || this.calculateSize(parsedData);

    const descriptor: AssetDescriptor = {
      id: assetId,
      type: metadata.type,
      cpuData: parsedData,
      gpuHandle: null,
      refCount: 0,
      lastAccess: Date.now(),
      memorySize,
      dependencies: metadata.dependencies || [],
      loadTime: Date.now(),
    };

    this.assets.set(assetId, descriptor);
    this.updateDependencies(assetId, metadata.dependencies || []);
    this.memoryUsage += memorySize;

    console.log(`[AssetRegistry] Registered asset: ${assetId} (${metadata.type})`);
    return descriptor;
  }

  /**
   * Get asset descriptor by ID
   */
  get(assetId: string): AssetDescriptor | undefined {
    const descriptor = this.assets.get(assetId);
    if (descriptor) {
      descriptor.lastAccess = Date.now();
    }
    return descriptor;
  }

  /**
   * Get asset CPU data by ID
   */
  getAssetData(assetId: string): unknown | undefined {
    const descriptor = this.assets.get(assetId);
    return descriptor?.cpuData;
  }

  /**
   * Add reference to asset (when ECS component uses it)
   */
  addRef(assetId: string): boolean {
    const descriptor = this.assets.get(assetId);
    if (!descriptor) {
      return false;
    }

    descriptor.refCount++;
    descriptor.lastAccess = Date.now();
    return true;
  }

  /**
   * Remove reference from asset
   */
  releaseRef(assetId: string): boolean {
    const descriptor = this.assets.get(assetId);
    if (!descriptor) {
      return false;
    }

    descriptor.refCount--;
    descriptor.lastAccess = Date.now();

    // If no more references, schedule for cleanup
    if (descriptor.refCount <= 0) {
      this.scheduleCleanup(assetId);
    }

    return true;
  }

  /**
   * Set GPU handle for asset (called by GPU resource manager)
   */
  setGPUHandle(assetId: string, gpuHandle: unknown): boolean {
    const descriptor = this.assets.get(assetId);
    if (!descriptor) {
      return false;
    }

    descriptor.gpuHandle = gpuHandle;
    return true;
  }

  /**
   * Get GPU handle for asset
   */
  getGPUHandle(assetId: string): unknown | null {
    const descriptor = this.assets.get(assetId);
    return descriptor?.gpuHandle || null;
  }

  /**
   * Preload dependencies for an asset
   */
  async preloadDependencies(assetId: string): Promise<void> {
    const dependencies = this.dependencyGraph.get(assetId) || [];

    const loadPromises = dependencies.map((depId) => {
      if (!this.assets.has(depId)) {
        // Dependencies should be loaded with high priority
        return AssetLoader.loadAsset(depId, 'high');
      }
    });

    await Promise.all(loadPromises.filter(Boolean));
  }

  /**
   * Get all assets by type
   */
  getAssetsByType(type: AssetType): AssetDescriptor[] {
    return Array.from(this.assets.values()).filter((asset) => asset.type === type);
  }

  /**
   * Get all loaded assets
   */
  getAllAssets(): AssetDescriptor[] {
    return Array.from(this.assets.values());
  }

  /**
   * Remove asset from registry
   */
  removeAsset(assetId: string): boolean {
    const descriptor = this.assets.get(assetId);
    if (!descriptor) {
      return false;
    }

    this.memoryUsage -= descriptor.memorySize;
    this.assets.delete(assetId);
    this.dependencyGraph.delete(assetId);

    console.log(`[AssetRegistry] Removed asset: ${assetId}`);
    return true;
  }

  /**
   * Clear all assets
   */
  clearAssets(): void {
    this.assets.clear();
    this.dependencyGraph.clear();
    this.memoryUsage = 0;
    console.log('[AssetRegistry] Cleared all assets');
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    totalMemory: number;
    assetCount: number;
    byType: Record<AssetType, number>;
  } {
    const byType = {} as Record<AssetType, number>;

    for (const asset of this.assets.values()) {
      byType[asset.type] = (byType[asset.type] || 0) + 1;
    }

    return {
      totalMemory: this.memoryUsage,
      assetCount: this.assets.size,
      byType,
    };
  }

  /**
   * Update dependency graph
   */
  private updateDependencies(assetId: string, dependencies: string[]): void {
    this.dependencyGraph.set(assetId, dependencies);
  }

  /**
   * Calculate memory size of data
   */
  private calculateSize(data: unknown): number {
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    if (data instanceof Float32Array || data instanceof Uint16Array) {
      return data.byteLength;
    }
    if (typeof data === 'string') {
      return data.length * 2; // UTF-16
    }
    if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data).length * 2; // Rough estimate
    }
    return 0;
  }

  /**
   * Schedule asset for cleanup (when refCount reaches 0)
   */
  private scheduleCleanup(assetId: string): void {
    // In a real implementation, this would schedule cleanup
    // For now, we just log it
    console.log(`[AssetRegistry] Asset ${assetId} scheduled for cleanup`);
  }
}

// Global asset registry instance
export const assetRegistry = new AssetRegistry();
