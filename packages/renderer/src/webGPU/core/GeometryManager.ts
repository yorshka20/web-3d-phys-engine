import { GeometryData, GeometryFactory, GeometryType } from '@ecs/components/physics/mesh';
import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable } from './decorators/ResourceDecorators';
import { GeometryCacheItem, GeometryParams } from './types/geometry';

/**
 * Geometry Manager
 * Manages different types of geometries, including caching and resource management
 */
@Injectable(ServiceTokens.GEOMETRY_MANAGER, {
  lifecycle: 'singleton',
})
export class GeometryManager {
  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  private geometryCache: Map<string, GeometryCacheItem> = new Map();

  /**
   * Get or create geometry
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Geometry cache item
   */
  getGeometry<T extends GeometryType>(
    type: T,
    params: GeometryParams<T> = {} as GeometryParams<T>,
  ): GeometryCacheItem {
    const cacheKey = this.generateCacheKey(type, params);

    // Check cache
    if (this.geometryCache.has(cacheKey)) {
      return this.geometryCache.get(cacheKey)!;
    }

    // Create new geometry
    const geometry = this.createGeometry(type, params);
    const cacheItem = this.createCacheItem(geometry, cacheKey);

    // Cache geometry
    this.geometryCache.set(cacheKey, cacheItem);

    return cacheItem;
  }

  /**
   * Get or create geometry from existing geometry data
   * @param geometryData Existing geometry data
   * @param geometryId Unique identifier for this geometry
   * @returns Geometry cache item
   */
  getGeometryFromData(geometryData: GeometryData, geometryId?: string): GeometryCacheItem {
    const cacheKey = geometryId || this.generateCacheKeyFromData(geometryData);

    // Check cache
    if (this.geometryCache.has(cacheKey)) {
      return this.geometryCache.get(cacheKey)!;
    }

    // Create cache item from existing geometry data
    const cacheItem = this.createCacheItem(geometryData, cacheKey);

    // Cache geometry
    this.geometryCache.set(cacheKey, cacheItem);

    return cacheItem;
  }

  /**
   * Generate cache key
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Cache key
   */
  private generateCacheKey<T extends GeometryType>(type: T, params: GeometryParams<T>): string {
    const paramStr = JSON.stringify(params);
    return `${type}_${paramStr}`;
  }

  /**
   * Generate cache key from geometry data
   * @param geometryData Geometry data
   * @returns Cache key
   */
  private generateCacheKeyFromData(geometryData: GeometryData): string {
    // Create a hash-like key based on geometry data properties
    const vertexCount = geometryData.vertexCount;
    const indexCount = geometryData.indexCount;
    const bounds = geometryData.bounds;
    return `data_${vertexCount}_${indexCount}_${bounds.min.join(',')}_${bounds.max.join(',')}`;
  }

  /**
   * Create geometry data
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Geometry data
   */
  private createGeometry<T extends GeometryType>(type: T, params: GeometryParams<T>): GeometryData {
    return GeometryFactory.createGeometryDataByDescriptor({ type, params });
  }

  /**
   * Create cache item
   * @param geometry Geometry data
   * @param cacheKey Cache key
   * @returns Geometry cache item
   */
  private createCacheItem(geometry: GeometryData, cacheKey: string): GeometryCacheItem {
    // Create vertex buffer
    const vertexBuffer = this.bufferManager.createVertexBuffer(
      `${cacheKey}_vertices`,
      geometry.vertices.buffer,
    );

    if (!vertexBuffer) {
      throw new Error(`Failed to create vertex buffer for ${cacheKey}`);
    }

    // Create index buffer
    const indexBuffer = this.bufferManager.createIndexBuffer(
      `${cacheKey}_indices`,
      geometry.indices.buffer,
    );

    if (!indexBuffer) {
      throw new Error(`Failed to create index buffer for ${cacheKey}`);
    }

    return {
      geometry,
      vertexBuffer,
      indexBuffer,
      vertexCount: geometry.vertexCount,
      indexCount: geometry.indexCount,
      bounds: {
        min: geometry.bounds.min as [number, number, number],
        max: geometry.bounds.max as [number, number, number],
      },
    };
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getCacheStats(): { totalGeometries: number; cacheKeys: string[] } {
    return {
      totalGeometries: this.geometryCache.size,
      cacheKeys: Array.from(this.geometryCache.keys()),
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.geometryCache.clear();
  }

  /**
   * Destroy manager
   */
  destroy(): void {
    this.clearCache();
  }
}
