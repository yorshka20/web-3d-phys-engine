import { GeometryData, GeometryFactory, GeometryType } from '@ecs/components/physics/mesh';
import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable, SmartResource } from './decorators/ResourceDecorators';
import { ResourceType } from './types/constant';
import {
  GeometryCacheItem,
  GeometryDataDescriptor,
  GeometryDescriptor,
  GeometryParams,
} from './types/geometry';

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

  /**
   * Create geometry from type and parameters
   * @param label Geometry label
   * @param descriptor Geometry descriptor
   * @returns Geometry cache item
   */
  @SmartResource(ResourceType.GEOMETRY, {
    cache: true,
    lifecycle: 'persistent',
  })
  createGeometry<T extends GeometryType>(
    label: string,
    descriptor: GeometryDescriptor<T>,
  ): GeometryCacheItem {
    const { type, params = {} as GeometryParams<T> } = descriptor;

    // Create geometry data
    const geometry = this.createGeometryData(type, params);
    return this.createCacheItem(geometry, label);
  }

  /**
   * Create geometry from existing geometry data
   * @param label Geometry label
   * @param descriptor Geometry data descriptor
   * @returns Geometry cache item
   */
  @SmartResource(ResourceType.GEOMETRY, {
    cache: true,
    lifecycle: 'persistent',
  })
  createGeometryFromData(label: string, descriptor: GeometryDataDescriptor): GeometryCacheItem {
    const { geometryData } = descriptor;
    return this.createCacheItem(geometryData, label);
  }

  /**
   * Create geometry data
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Geometry data
   */
  private createGeometryData<T extends GeometryType>(
    type: T,
    params: GeometryParams<T>,
  ): GeometryData {
    return GeometryFactory.createGeometryDataByDescriptor({ type, params });
  }

  /**
   * Create cache item
   * @param geometry Geometry data
   * @param label Geometry label
   * @returns Geometry cache item
   */
  private createCacheItem(geometry: GeometryData, label: string): GeometryCacheItem {
    // Create vertex buffer
    const vertexBuffer = this.bufferManager.createVertexBuffer(`${label}_vertices`, {
      data: geometry.vertices.buffer as ArrayBuffer,
    });

    if (!vertexBuffer) {
      throw new Error(`Failed to create vertex buffer for ${label}`);
    }

    // Create index buffer
    const indexBuffer = this.bufferManager.createIndexBuffer(`${label}_indices`, {
      data: geometry.indices.buffer as ArrayBuffer,
    });

    if (!indexBuffer) {
      throw new Error(`Failed to create index buffer for ${label}`);
    }

    return {
      geometry,
      vertexBuffer,
      indexBuffer,
      vertexCount: geometry.vertexCount,
      indexCount: geometry.indexCount,
      primitiveType: geometry.primitiveType,
      bounds: {
        min: geometry.bounds.min as [number, number, number],
        max: geometry.bounds.max as [number, number, number],
      },
    };
  }

  /**
   * Destroy manager
   */
  destroy(): void {
    // SmartResource handles cleanup automatically
  }
}
