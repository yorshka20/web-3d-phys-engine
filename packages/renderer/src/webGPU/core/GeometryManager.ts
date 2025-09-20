import { GeometryData, GeometryFactory, GeometryType } from '@ecs/components/physics/mesh';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable, SmartResource } from './decorators/ResourceDecorators';
import { GPUResourceCoordinator } from './GPUResourceCoordinator';
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

  @Inject(ServiceTokens.GPU_RESOURCE_COORDINATOR)
  private gpuResourceCoordinator!: GPUResourceCoordinator;

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
    return this.createCacheItem(label, geometry);
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
    return this.createCacheItem(label, geometryData);
  }

  createPMXGeometry(
    pmxModel: PMXModel,
    materialIndex: number,
    geometryId: string,
  ): GeometryCacheItem {
    const material = pmxModel.materials[materialIndex];
    if (!material) {
      throw new Error(`PMX material ${materialIndex} not found`);
    }

    // Calculate face range for this material
    let faceStart = 0;
    for (let i = 0; i < materialIndex; i++) {
      faceStart += pmxModel.materials[i].faceCount;
    }
    const faceEnd = faceStart + material.faceCount;

    // Extract vertices and faces for this material
    const materialVertices: number[] = [];
    const materialIndices: number[] = [];
    const vertexMap = new Map<number, number>();

    // normalize vertices to fix skinning data
    const normalizedVertices = this.gpuResourceCoordinator.normalizeVertexData(pmxModel.vertices);

    const floatsPerVertex = 17; // 3+3+2+4+4+1

    // Process faces for this material
    for (let faceIndex = faceStart; faceIndex < faceEnd; faceIndex++) {
      const face = pmxModel.faces[faceIndex];
      if (!face) continue;

      const triangleIndices: number[] = [];

      // Process each vertex in the triangle
      for (const originalVertexIndex of face.indices) {
        let newVertexIndex = vertexMap.get(originalVertexIndex);

        if (newVertexIndex === undefined) {
          // 17 floats per vertex
          newVertexIndex = materialVertices.length / floatsPerVertex;

          const vertex = normalizedVertices[originalVertexIndex];
          if (vertex) {
            // Position (3 floats)
            materialVertices.push(vertex.position[0], vertex.position[1], vertex.position[2]);
            // Normal (3 floats)
            materialVertices.push(vertex.normal[0], vertex.normal[1], vertex.normal[2]);
            // UV (2 floats)
            materialVertices.push(vertex.uv[0], vertex.uv[1]);
            // Skin indices (4 floats)
            materialVertices.push(
              vertex.skinIndices[0],
              vertex.skinIndices[1],
              vertex.skinIndices[2],
              vertex.skinIndices[3],
            );
            // Skin weights (4 floats)
            materialVertices.push(
              vertex.skinWeights[0],
              vertex.skinWeights[1],
              vertex.skinWeights[2],
              vertex.skinWeights[3],
            );
            // Edge ratio (1 float)
            materialVertices.push(vertex.edgeRatio);
          }

          vertexMap.set(originalVertexIndex, newVertexIndex);
        }

        triangleIndices.push(newVertexIndex);
      }

      materialIndices.push(...triangleIndices);
    }

    // Ensure indices alignment
    const alignedIndices = [...materialIndices];
    if (alignedIndices.length % 2 !== 0) {
      alignedIndices.push(alignedIndices[alignedIndices.length - 1]);
    }

    // Create geometry data
    const geometryData = {
      vertices: new Float32Array(materialVertices),
      indices: new Uint16Array(alignedIndices),
      vertexCount: materialVertices.length / floatsPerVertex,
      indexCount: alignedIndices.length,
      primitiveType: 'triangle-list' as const,
      vertexFormat: 'pmx' as const,
      bounds: this.calculateBounds(materialVertices, floatsPerVertex),
    };

    const geometry = this.createGeometryFromData(geometryId, { geometryData });
    return geometry;
  }

  private calculateBounds(vertices: number[], stride: number) {
    if (vertices.length === 0) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }

    let minX = vertices[0],
      minY = vertices[1],
      minZ = vertices[2];
    let maxX = vertices[0],
      maxY = vertices[1],
      maxZ = vertices[2];

    for (let i = 0; i < vertices.length; i += stride) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
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
   * @param label Geometry label
   * @param geometry Geometry data
   * @returns Geometry cache item
   */
  private createCacheItem(label: string, geometry: GeometryData): GeometryCacheItem {
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
