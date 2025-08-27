import { BufferManager } from './BufferManager';
import { GeometryData, GeometryFactory } from './GeometryFactory';

/**
 * Geometry cache item
 */
export interface GeometryCacheItem {
  geometry: GeometryData;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  vertexCount: number;
  indexCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/**
 * Geometry types
 */
export type GeometryType = 'cube' | 'sphere' | 'plane' | 'cylinder' | 'cone';

/**
 * Geometry parameters
 */
export interface GeometryParams {
  cube?: { segments?: number };
  sphere?: { segments?: number };
  plane?: { segments?: number };
  cylinder?: { segments?: number };
  cone?: { segments?: number };
}

/**
 * Geometry Manager
 * Manages different types of geometries, including caching and resource management
 */
export class GeometryManager {
  private geometryCache: Map<string, GeometryCacheItem> = new Map();

  constructor(private bufferManager: BufferManager) {
    if (!bufferManager) {
      throw new Error('Buffer manager is required');
    }
  }

  /**
   * Get or create geometry
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Geometry cache item
   */
  getGeometry(type: GeometryType, params: GeometryParams = {}): GeometryCacheItem {
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
   * Create unit cube geometry (1x1x1)
   * @param segments Cube segments (not used for cube, kept for consistency)
   * @returns Geometry cache item
   */
  createCube(segments?: number): GeometryCacheItem {
    return this.getGeometry('cube', { cube: { segments } });
  }

  /**
   * Create unit sphere geometry (radius = 0.5)
   * @param segments Sphere segments
   * @returns Geometry cache item
   */
  createSphere(segments: number = 32): GeometryCacheItem {
    return this.getGeometry('sphere', { sphere: { segments } });
  }

  /**
   * Create unit plane geometry (1x1)
   * @param segments Plane segments
   * @returns Geometry cache item
   */
  createPlane(segments: number = 1): GeometryCacheItem {
    return this.getGeometry('plane', { plane: { segments } });
  }

  /**
   * Create unit cylinder geometry (radius = 0.5, height = 1.0)
   * @param segments Cylinder segments
   * @returns Geometry cache item
   */
  createCylinder(segments: number = 32): GeometryCacheItem {
    return this.getGeometry('cylinder', { cylinder: { segments } });
  }

  /**
   * Create unit cone geometry (radius = 0.5, height = 1.0)
   * @param segments Cone segments
   * @returns Geometry cache item
   */
  createCone(segments: number = 32): GeometryCacheItem {
    return this.getGeometry('cone', { cone: { segments } });
  }

  /**
   * Generate cache key
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Cache key
   */
  private generateCacheKey(type: GeometryType, params: GeometryParams): string {
    const paramStr = JSON.stringify(params);
    return `${type}_${paramStr}`;
  }

  /**
   * Create geometry data
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Geometry data
   */
  private createGeometry(type: GeometryType, params: GeometryParams): GeometryData {
    switch (type) {
      case 'cube':
        return GeometryFactory.createCube();

      case 'sphere':
        const sphereSegments = params.sphere?.segments ?? 32;
        return GeometryFactory.createSphere(sphereSegments);

      case 'plane':
        const planeSegments = params.plane?.segments ?? 1;
        return GeometryFactory.createPlane(planeSegments);

      case 'cylinder':
        const cylinderSegments = params.cylinder?.segments ?? 32;
        return GeometryFactory.createCylinder(cylinderSegments);

      case 'cone':
        const coneSegments = params.cone?.segments ?? 32;
        return GeometryFactory.createCone(coneSegments);

      default:
        throw new Error(`Unsupported geometry type: ${type}`);
    }
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
