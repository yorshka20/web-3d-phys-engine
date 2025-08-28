import { GeometryData, GeometryFactory } from '@ecs/components/physics/mesh';
import { Vec3 } from '@ecs/types/types';

/**
 * WebGPU geometry representation
 */
export interface WebGPUGeometry {
  id: string;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  vertexCount: number;
  indexCount: number;
  bounds: {
    min: Vec3;
    max: Vec3;
  };
  vertexFormat: 'simple' | 'full';
  primitiveTopology: GPUPrimitiveTopology;
}

/**
 * WebGPU Geometry Manager
 *
 * Handles geometry descriptor management and validation.
 * Actual WebGPU resource creation is handled by the renderer package.
 * This class focuses on geometry property management and caching.
 */
export class WebGPUGeometryManager {
  private geometryCache: Map<string, WebGPUGeometry> = new Map();

  constructor() {
    // No device dependency - resources created by renderer
  }

  /**
   * Create geometry descriptor from ECS geometry data
   */
  createGeometryDescriptor(id: string, geometryData: GeometryData): WebGPUGeometry {
    // Check cache first
    if (this.geometryCache.has(id)) {
      return this.geometryCache.get(id)!;
    }

    const webgpuGeometry: WebGPUGeometry = {
      id,
      vertexBuffer: null as any, // Will be set by renderer
      indexBuffer: null as any, // Will be set by renderer
      vertexCount: geometryData.vertexCount,
      indexCount: geometryData.indexCount,
      bounds: geometryData.bounds,
      vertexFormat: geometryData.vertexFormat,
      primitiveTopology: 'triangle-list',
    };

    // Cache the geometry descriptor
    this.geometryCache.set(id, webgpuGeometry);

    return webgpuGeometry;
  }

  /**
   * Create geometry from primitive shape
   */
  createPrimitiveGeometry(
    id: string,
    type: keyof typeof GeometryFactory,
    options: any = {},
  ): WebGPUGeometry {
    // Check cache first
    if (this.geometryCache.has(id)) {
      return this.geometryCache.get(id)!;
    }

    // Generate geometry data using GeometryFactory
    let geometryData: GeometryData;

    switch (type) {
      case 'createCube':
        geometryData = GeometryFactory.createCube(options);
        break;
      case 'createSphere':
        geometryData = GeometryFactory.createSphere(options);
        break;
      case 'createPlane':
        geometryData = GeometryFactory.createPlane(options);
        break;
      case 'createCylinder':
        geometryData = GeometryFactory.createCylinder(options);
        break;
      case 'createCone':
        geometryData = GeometryFactory.createCone(options);
        break;
      case 'createIcosphere':
        geometryData = GeometryFactory.createIcosphere(options);
        break;
      case 'createEllipsoid':
        geometryData = GeometryFactory.createEllipsoid(options);
        break;
      case 'createCapsule':
        geometryData = GeometryFactory.createCapsule(options);
        break;
      case 'createTorus':
        geometryData = GeometryFactory.createTorus(options);
        break;
      case 'createTetrahedron':
        geometryData = GeometryFactory.createTetrahedron(options);
        break;
      case 'createIcosahedron':
        geometryData = GeometryFactory.createIcosahedron(options);
        break;
      case 'createQuad':
        geometryData = GeometryFactory.createQuad(options);
        break;
      case 'createRoundedCube':
        geometryData = GeometryFactory.createRoundedCube(options);
        break;
      case 'createEllipse':
        geometryData = GeometryFactory.createEllipse(options);
        break;
      case 'createDisc':
        geometryData = GeometryFactory.createDisc(options);
        break;
      case 'createCircle':
        geometryData = GeometryFactory.createCircle(options);
        break;
      case 'createRoundedRectangle':
        geometryData = GeometryFactory.createRoundedRectangle(options);
        break;
      case 'createStadium':
        geometryData = GeometryFactory.createStadium(options);
        break;
      default:
        throw new Error(`Unsupported geometry type: ${type}`);
    }

    return this.createGeometryDescriptor(id, geometryData);
  }

  /**
   * Create geometry from custom vertex data
   */
  createCustomGeometry(
    id: string,
    vertices: Float32Array,
    indices: Uint16Array,
    bounds?: { min: Vec3; max: Vec3 },
  ): WebGPUGeometry {
    // Check cache first
    if (this.geometryCache.has(id)) {
      return this.geometryCache.get(id)!;
    }

    // Calculate bounds if not provided
    if (!bounds) {
      bounds = this.calculateBounds(vertices);
    }

    const geometryData: GeometryData = {
      vertices,
      indices,
      vertexCount: vertices.length / 8, // Assuming full format (pos + normal + uv)
      indexCount: indices.length,
      vertexFormat: 'full',
      bounds,
    };

    return this.createGeometryDescriptor(id, geometryData);
  }

  /**
   * Calculate bounding box from vertex data
   */
  private calculateBounds(vertices: Float32Array): { min: Vec3; max: Vec3 } {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    // Assuming vertices are in format: [x, y, z, nx, ny, nz, u, v]
    for (let i = 0; i < vertices.length; i += 8) {
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
   * Get vertex buffer layout for WebGPU pipeline
   */
  getVertexBufferLayout(vertexFormat: 'simple' | 'full'): GPUVertexBufferLayout {
    if (vertexFormat === 'simple') {
      return {
        arrayStride: 12, // 3 floats * 4 bytes
        attributes: [
          {
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0,
          },
        ],
      };
    } else {
      // Full format: position + normal + uv
      return {
        arrayStride: 32, // 8 floats * 4 bytes
        attributes: [
          {
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0, // position
          },
          {
            format: 'float32x3',
            offset: 12,
            shaderLocation: 1, // normal
          },
          {
            format: 'float32x2',
            offset: 24,
            shaderLocation: 2, // uv
          },
        ],
      };
    }
  }

  /**
   * Update geometry descriptor (for dynamic geometry)
   */
  updateGeometryDescriptor(id: string, geometryData: GeometryData): void {
    const geometry = this.geometryCache.get(id);
    if (!geometry) {
      throw new Error(`Geometry ${id} not found`);
    }

    // Update geometry properties
    geometry.vertexCount = geometryData.vertexCount;
    geometry.indexCount = geometryData.indexCount;
    geometry.bounds = geometryData.bounds;
    geometry.vertexFormat = geometryData.vertexFormat;
  }

  /**
   * Get cached geometry
   */
  getGeometry(id: string): WebGPUGeometry | undefined {
    return this.geometryCache.get(id);
  }

  /**
   * Remove geometry from cache
   */
  removeGeometry(id: string): void {
    this.geometryCache.delete(id);
  }

  /**
   * Clear all cached geometries
   */
  clearCache(): void {
    this.geometryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { geometryCount: number } {
    return {
      geometryCount: this.geometryCache.size,
    };
  }

  /**
   * Create instanced geometry descriptor for batch rendering
   */
  createInstancedGeometryDescriptor(
    baseGeometryId: string,
    instanceCount: number,
    instanceData: Float32Array,
  ): { instanceBufferId: string; instanceCount: number } {
    const instanceBufferId = `instance_${baseGeometryId}_${instanceCount}`;

    return {
      instanceBufferId,
      instanceCount,
    };
  }

  /**
   * Get instance buffer layout for WebGPU pipeline
   */
  getInstanceBufferLayout(): GPUVertexBufferLayout {
    return {
      arrayStride: 64, // 4x4 matrix * 4 bytes per float
      stepMode: 'instance',
      attributes: [
        {
          format: 'float32x4',
          offset: 0,
          shaderLocation: 3, // instance matrix row 0
        },
        {
          format: 'float32x4',
          offset: 16,
          shaderLocation: 4, // instance matrix row 1
        },
        {
          format: 'float32x4',
          offset: 32,
          shaderLocation: 5, // instance matrix row 2
        },
        {
          format: 'float32x4',
          offset: 48,
          shaderLocation: 6, // instance matrix row 3
        },
      ],
    };
  }
}
