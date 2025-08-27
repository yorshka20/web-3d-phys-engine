import { BoxOptions } from 'primitive-geometry/types/src/box';
import { CapsuleOptions } from 'primitive-geometry/types/src/capsule';
import { CircleOptions } from 'primitive-geometry/types/src/circle';
import { ConeOptions } from 'primitive-geometry/types/src/cone';
import { CubeOptions } from 'primitive-geometry/types/src/cube';
import { CylinderOptions } from 'primitive-geometry/types/src/cylinder';
import { DiscOptions } from 'primitive-geometry/types/src/disc';
import { EllipseOptions } from 'primitive-geometry/types/src/ellipse';
import { EllipsoidOptions } from 'primitive-geometry/types/src/ellipsoid';
import { IcosahedronOptions } from 'primitive-geometry/types/src/icosahedron';
import { IcosphereOptions } from 'primitive-geometry/types/src/icosphere';
import { PlaneOptions } from 'primitive-geometry/types/src/plane';
import { QuadOptions } from 'primitive-geometry/types/src/quad';
import { RoundedCubeOptions } from 'primitive-geometry/types/src/rounded-cube';
import { SphereOptions } from 'primitive-geometry/types/src/sphere';
import { StadiumOptions } from 'primitive-geometry/types/src/stadium';
import { TetrahedronOptions } from 'primitive-geometry/types/src/tetrahedron';
import { TorusOptions } from 'primitive-geometry/types/src/torus';
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
export type GeometryType =
  // Basic 3D shapes
  | 'cube'
  | 'sphere'
  | 'plane'
  | 'cylinder'
  | 'cone'
  // Additional 3D shapes
  | 'box'
  | 'roundedCube'
  | 'icosphere'
  | 'ellipsoid'
  | 'capsule'
  | 'torus'
  | 'tetrahedron'
  | 'icosahedron'
  // 2D shapes
  | 'quad'
  | 'roundedRectangle'
  | 'stadium'
  | 'ellipse'
  | 'disc'
  | 'circle';

export type GeometryPrimitiveOptions = {
  cube: CubeOptions;
  sphere: SphereOptions;
  plane: PlaneOptions;
  cylinder: CylinderOptions;
  cone: ConeOptions;
  box: BoxOptions;
  roundedCube: RoundedCubeOptions;
  icosphere: IcosphereOptions;
  ellipsoid: EllipsoidOptions;
  capsule: CapsuleOptions;
  torus: TorusOptions;
  tetrahedron: TetrahedronOptions;
  icosahedron: IcosahedronOptions;
  quad: QuadOptions;
  roundedRectangle: RoundedCubeOptions;
  stadium: StadiumOptions;
  ellipse: EllipseOptions;
  disc: DiscOptions;
  circle: CircleOptions;
};

/**
 * Geometry parameters
 */
export interface GeometryParams {
  // Basic 3D shapes
  cube?: GeometryPrimitiveOptions['cube'];
  sphere?: GeometryPrimitiveOptions['sphere'];
  plane?: GeometryPrimitiveOptions['plane'];
  cylinder?: GeometryPrimitiveOptions['cylinder'];
  cone?: GeometryPrimitiveOptions['cone'];

  // Additional 3D shapes
  box?: GeometryPrimitiveOptions['box'];
  roundedCube?: GeometryPrimitiveOptions['roundedCube'];
  icosphere?: GeometryPrimitiveOptions['icosphere'];
  ellipsoid?: GeometryPrimitiveOptions['ellipsoid'];
  capsule?: GeometryPrimitiveOptions['capsule'];
  torus?: GeometryPrimitiveOptions['torus'];
  tetrahedron?: GeometryPrimitiveOptions['tetrahedron'];
  icosahedron?: GeometryPrimitiveOptions['icosahedron'];

  // 2D shapes
  quad?: GeometryPrimitiveOptions['quad'];
  roundedRectangle?: GeometryPrimitiveOptions['roundedRectangle'];
  stadium?: GeometryPrimitiveOptions['stadium'];
  ellipse?: GeometryPrimitiveOptions['ellipse'];
  disc?: GeometryPrimitiveOptions['disc'];
  circle?: GeometryPrimitiveOptions['circle'];
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
      // Basic 3D shapes
      case 'cube':
        return GeometryFactory.createCube();

      case 'sphere':
        return GeometryFactory.createSphere(params.sphere ?? {});

      case 'plane':
        return GeometryFactory.createPlane(params.plane ?? {});

      case 'cylinder':
        return GeometryFactory.createCylinder(params.cylinder ?? {});

      case 'cone':
        return GeometryFactory.createCone(params.cone ?? {});

      // Additional 3D shapes
      case 'box':
        return GeometryFactory.createBox(params.box ?? {});

      case 'roundedCube':
        return GeometryFactory.createRoundedCube(params.roundedCube ?? {});

      case 'icosphere':
        return GeometryFactory.createIcosphere(params.icosphere ?? {});

      case 'ellipsoid':
        return GeometryFactory.createEllipsoid(params.ellipsoid ?? {});

      case 'capsule':
        return GeometryFactory.createCapsule(params.capsule ?? {});

      case 'torus':
        return GeometryFactory.createTorus(params.torus ?? {});

      case 'tetrahedron':
        return GeometryFactory.createTetrahedron(params.tetrahedron ?? {});

      case 'icosahedron':
        return GeometryFactory.createIcosahedron(params.icosahedron ?? {});

      // 2D shapes
      case 'quad':
        return GeometryFactory.createQuad(params.quad ?? {});

      case 'roundedRectangle':
        return GeometryFactory.createRoundedRectangle(params.roundedRectangle ?? {});

      case 'stadium':
        return GeometryFactory.createStadium(params.stadium ?? {});

      case 'ellipse':
        return GeometryFactory.createEllipse(params.ellipse ?? {});

      case 'disc':
        return GeometryFactory.createDisc(params.disc ?? {});

      case 'circle':
        return GeometryFactory.createCircle(params.circle ?? {});

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
