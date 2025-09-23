/**
 * Asset Registry - Centralized CPU resource management
 * Manages loaded assets in CPU memory and their references
 * This follows the design principle of separating asset loading from GPU resource creation
 */

import { GeometryData } from '@ecs/components/physics/mesh/GeometryFactory';
import { GLTFModel } from '@ecs/components/physics/mesh/GltfModel';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { WebGPUMaterialDescriptor } from '@ecs/components/rendering/render/types';

export interface AssetDescriptor<T extends AssetType = AssetType> {
  id: string;
  type: T;
  rawData: RawDataType<T>; // Raw parsed data
  gpuHandle: unknown | null; // GPU resource handle (created lazily)
  refCount: number; // ECS component reference count
  lastAccess: number; // LRU management
  memorySize: number; // CPU memory usage
  dependencies: string[]; // Asset dependencies
  loadTime: number;
}

// Mapping from AssetType to its raw data type
export interface AssetRawDataTypeMap {
  pmx_model: PMXModel;
  pmx_material: PMXModel;
  texture: HTMLImageElement;
  material: WebGPUMaterialDescriptor;
  mesh: GeometryData;
  geometry: GeometryData;
  gltf: GLTFModel;
}

// RawDataType picks the mapped type by key, or unknown if not mapped
export type RawDataType<T extends AssetType> = T extends keyof AssetRawDataTypeMap
  ? AssetRawDataTypeMap[T]
  : unknown;

export type AssetType =
  | 'mesh'
  | 'texture'
  | 'material'
  | 'pmx_model'
  | 'pmx_material'
  | 'geometry'
  | 'gltf';

export interface AssetMetadata {
  type: AssetType;
  dependencies: string[];
  memorySize?: number;
}

/**
 * Asset Registry - Manages CPU resources and their lifecycle
 */
export class AssetRegistry {
  private assets: Map<string, AssetDescriptor<AssetType>> = new Map();
  private dependencyGraph: Map<string, string[]> = new Map();
  private memoryUsage: number = 0;

  /**
   * Register a loaded asset
   */
  register<T extends AssetType>(
    assetId: string,
    parsedData: RawDataType<T>,
    metadata: AssetMetadata,
  ): AssetDescriptor<T> {
    const memorySize = metadata.memorySize || this.calculateSize(parsedData);

    const descriptor: AssetDescriptor<T> = {
      id: assetId,
      type: metadata.type as T,
      rawData: parsedData,
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
  getAssetDescriptor<T extends AssetType>(assetId: string): AssetDescriptor<T> | undefined {
    const descriptor = this.assets.get(assetId);
    if (descriptor) {
      descriptor.lastAccess = Date.now();
    }
    return descriptor as AssetDescriptor<T> | undefined;
  }

  /**
   * Get asset CPU data by ID
   */
  getAssetData(assetId: string) {
    const descriptor = this.assets.get(assetId);
    return descriptor?.rawData;
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
   * Get all assets by type
   */
  getAssetsByType<T extends AssetType>(type: T): AssetDescriptor<T>[] {
    return Array.from(this.assets.values()).filter(
      (asset) => asset.type === type,
    ) as AssetDescriptor<T>[];
  }

  /**
   * Get all loaded assets
   */
  getAllAssets(): AssetDescriptor<AssetType>[] {
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
