import { Vec3 } from '@ecs/types/types';
import {
  box,
  capsule,
  circle,
  cone,
  // 3D shapes
  cube,
  cylinder,
  disc,
  ellipse,
  ellipsoid,
  icosahedron,
  icosphere,
  plane,
  // 2D shapes
  quad,
  roundedCube,
  roundedRectangle,
  sphere,
  stadium,
  tetrahedron,
  torus,
} from 'primitive-geometry';
import {
  AnyMesh3DShapeDescriptor,
  GeometryPrimitiveOptions,
  GeometryType,
  Mesh3DDescriptor,
  Mesh3DShapeDescriptor,
} from './types';

/**
 * Vertex format types.
 * - simple: position only
 * - full: position + normal + uv
 * - colored: position + color
 */
export type VertexFormat = 'simple' | 'full' | 'colored';

/**
 * Geometry data
 */
export interface GeometryData {
  vertices: Float32Array;
  indices: Uint16Array;
  vertexCount: number;
  indexCount: number;
  vertexFormat: VertexFormat; // 'simple' for position only, 'full' for pos+normal+uv
  primitiveType: GPUPrimitiveTopology; // primitive topology for rendering
  bounds: {
    min: Vec3;
    max: Vec3;
  };
}

/**
 * Geometry Factory Class
 * Used to generate common 3D geometry data using primitive-geometry library
 */
export class GeometryFactory {
  /**
   * Get default parameters for each geometry type based on primitive-geometry documentation
   */
  static getDefaultParams(type: string): Record<string, unknown> {
    switch (type) {
      case 'cube':
        return {
          sx: 1,
          sy: 1,
          sz: 1,
          nx: 1,
          ny: 1,
          nz: 1,
        };
      case 'box':
        return {
          sx: 1,
          sy: 1,
          sz: 1,
        };
      case 'sphere':
        return {
          radius: 0.5,
          nx: 32,
          ny: 16,
          theta: Math.PI,
          thetaOffset: 0,
          phi: Math.PI * 2,
          phiOffset: 0,
        };
      case 'cylinder':
        return {
          height: 1,
          radius: 0.25,
          nx: 16,
          ny: 1,
          radiusApex: 0.25,
          capSegments: 1,
          capApex: true,
          capBase: true,
          capBaseSegments: 1,
          phi: Math.PI * 2,
        };
      case 'plane':
        return {
          sx: 1,
          sy: 1,
          nx: 1,
          ny: 1,
          direction: 'z',
          quads: false,
        };
      case 'cone':
        return {
          height: 1,
          radius: 0.25,
          nx: 16,
          ny: 1,
          capSegments: 1,
          capBase: true,
          theta: Math.PI * 2,
        };
      case 'icosphere':
        return {
          radius: 0.5,
          subdivisions: 2,
        };
      case 'ellipsoid':
        return {
          radius: 0.5,
          nx: 32,
          ny: 16,
          rx: 1,
          ry: 0.5,
          rz: 0.5,
          theta: Math.PI,
          thetaOffset: 0,
          phi: Math.PI * 2,
          phiOffset: 0,
        };
      case 'capsule':
        return {
          height: 0.5,
          radius: 0.25,
          nx: 16,
          ny: 1,
          roundSegments: 32,
          phi: Math.PI * 2,
        };
      case 'torus':
        return {
          radius: 0.4,
          segments: 64,
          minorRadius: 0.1,
          minorSegments: 32,
          theta: Math.PI * 2,
          thetaOffset: 0,
          phi: Math.PI * 2,
          phiOffset: 0,
        };
      case 'tetrahedron':
        return {
          radius: 0.5,
        };
      case 'icosahedron':
        return {
          radius: 0.5,
        };
      case 'quad':
        return {
          scale: 0.5,
        };
      case 'roundedCube':
        return {
          sx: 1,
          sy: 1,
          sz: 1,
          nx: 1,
          ny: 1,
          nz: 1,
          radius: 0.25,
          roundSegments: 8,
          edgeSegments: 1,
        };
      case 'ellipse':
        return {
          sx: 1,
          sy: 0.5,
          radius: 0.5,
          segments: 32,
          innerSegments: 16,
          theta: Math.PI * 2,
          thetaOffset: 0,
          mergeCentroid: true,
        };
      case 'disc':
        return {
          radius: 0.5,
          segments: 32,
          innerSegments: 16,
          theta: Math.PI * 2,
          thetaOffset: 0,
          mergeCentroid: true,
        };
      case 'circle':
        return {
          radius: 0.5,
          segments: 32,
          theta: Math.PI * 2,
          thetaOffset: 0,
          closed: false,
        };
      case 'roundedRectangle':
        return {
          sx: 1,
          sy: 1,
          nx: 1,
          ny: 1,
          radius: 0.25,
          roundSegments: 8,
          edgeSegments: 1,
        };
      case 'stadium':
        return {
          sx: 1,
          sy: 1,
          nx: 1,
          ny: 1,
          roundSegments: 8,
          edgeSegments: 1,
        };
      default:
        return {};
    }
  }

  /**
   * Convert primitive-geometry data to our GeometryData format
   * @param primitiveData Data from primitive-geometry library
   * @param primitiveType Primitive topology for rendering
   * @returns Converted geometry data
   */
  private static convertPrimitiveGeometry(
    primitiveData: {
      positions: Float32Array;
      normals?: Float32Array;
      uvs?: Float32Array;
      cells: Uint16Array | Uint8Array | Uint32Array;
    },
    primitiveType: GPUPrimitiveTopology = 'triangle-list',
  ): GeometryData {
    const { positions, normals, uvs, cells } = primitiveData;

    // Calculate vertex count (positions array length / 3)
    const vertexCount = positions.length / 3;

    // Interleave vertex data: [x, y, z, nx, ny, nz, u, v] per vertex
    const vertices = new Float32Array(vertexCount * 8);

    for (let i = 0; i < vertexCount; i++) {
      const posIndex = i * 3;
      const uvIndex = i * 2;
      const vertexIndex = i * 8;

      // Position (x, y, z)
      vertices[vertexIndex] = positions[posIndex];
      vertices[vertexIndex + 1] = positions[posIndex + 1];
      vertices[vertexIndex + 2] = positions[posIndex + 2];

      // Normal (nx, ny, nz) - use default if not provided
      if (normals && normals.length >= posIndex + 3) {
        vertices[vertexIndex + 3] = normals[posIndex];
        vertices[vertexIndex + 4] = normals[posIndex + 1];
        vertices[vertexIndex + 5] = normals[posIndex + 2];
      } else {
        // Default normal pointing up
        vertices[vertexIndex + 3] = 0;
        vertices[vertexIndex + 4] = 1;
        vertices[vertexIndex + 5] = 0;
      }

      // UV (u, v) - use default if not provided
      if (uvs && uvs.length >= uvIndex + 2) {
        vertices[vertexIndex + 6] = uvs[uvIndex];
        vertices[vertexIndex + 7] = uvs[uvIndex + 1];
      } else {
        // Default UV coordinates
        vertices[vertexIndex + 6] = 0;
        vertices[vertexIndex + 7] = 0;
      }
    }

    // Calculate bounds
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    // Convert cells to Uint16Array if needed
    const indices = cells instanceof Uint16Array ? cells : new Uint16Array(cells);

    return {
      vertices,
      indices,
      vertexCount,
      indexCount: indices.length,
      vertexFormat: 'full' as VertexFormat,
      primitiveType,
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    };
  }

  // Generic method for type-safe geometry creation
  static createGeometryDataByDescriptorGeneric<T extends GeometryType>(
    descriptor: Mesh3DShapeDescriptor<T>,
  ): GeometryData {
    return GeometryFactory.createGeometryByType(descriptor.type, descriptor.params);
  }

  // Type-safe geometry creation by type and params
  static createGeometryByType<T extends GeometryType>(
    type: T,
    params?: GeometryPrimitiveOptions[T],
  ): GeometryData {
    switch (type) {
      case 'box':
        return GeometryFactory.createBox(params as GeometryPrimitiveOptions['box']);
      case 'sphere':
        return GeometryFactory.createSphere(params as GeometryPrimitiveOptions['sphere']);
      case 'cylinder':
        return GeometryFactory.createCylinder(params as GeometryPrimitiveOptions['cylinder']);
      case 'plane':
        return GeometryFactory.createPlane(params as GeometryPrimitiveOptions['plane']);
      case 'cone':
        return GeometryFactory.createCone(params as GeometryPrimitiveOptions['cone']);
      case 'cube':
        return GeometryFactory.createCube(params as GeometryPrimitiveOptions['cube']);
      case 'icosphere':
        return GeometryFactory.createIcosphere(params as GeometryPrimitiveOptions['icosphere']);
      case 'ellipsoid':
        return GeometryFactory.createEllipsoid(params as GeometryPrimitiveOptions['ellipsoid']);
      case 'capsule':
        return GeometryFactory.createCapsule(params as GeometryPrimitiveOptions['capsule']);
      case 'torus':
        return GeometryFactory.createTorus(params as GeometryPrimitiveOptions['torus']);
      case 'tetrahedron':
        return GeometryFactory.createTetrahedron(params as GeometryPrimitiveOptions['tetrahedron']);
      case 'icosahedron':
        return GeometryFactory.createIcosahedron(params as GeometryPrimitiveOptions['icosahedron']);
      case 'quad':
        return GeometryFactory.createQuad(params as GeometryPrimitiveOptions['quad']);
      case 'roundedCube':
        return GeometryFactory.createRoundedCube(params as GeometryPrimitiveOptions['roundedCube']);
      case 'ellipse':
        return GeometryFactory.createEllipse(params as GeometryPrimitiveOptions['ellipse']);
      case 'disc':
        return GeometryFactory.createDisc(params as GeometryPrimitiveOptions['disc']);
      case 'circle':
        return GeometryFactory.createCircle(params as GeometryPrimitiveOptions['circle']);
      case 'roundedRectangle':
        return GeometryFactory.createRoundedRectangle(
          params as GeometryPrimitiveOptions['roundedRectangle'],
        );
      case 'stadium':
        return GeometryFactory.createStadium(params as GeometryPrimitiveOptions['stadium']);
      default:
        throw new Error(`Unsupported geometry type: ${type}`);
    }
  }

  static createGeometryDataByDescriptor(
    descriptor: AnyMesh3DShapeDescriptor,
    primitiveType: GPUPrimitiveTopology = 'triangle-list',
  ): GeometryData {
    // Handle unset descriptor
    if (descriptor.type === 'unset') {
      throw new Error('Cannot create geometry from unset descriptor');
    }

    // Handle custom mesh descriptor
    if (descriptor.type === 'mesh') {
      return GeometryFactory.convertCustomMesh(descriptor, primitiveType);
    }

    // Handle primitive geometry descriptors using the new type-safe method
    return GeometryFactory.createGeometryDataByDescriptorGeneric(
      descriptor as Mesh3DShapeDescriptor,
    );
  }

  /**
   * Convert custom mesh descriptor to GeometryData
   * @param descriptor Custom mesh descriptor with vertices
   * @param primitiveType Primitive topology for rendering
   * @returns Converted geometry data
   */
  private static convertCustomMesh(
    descriptor: Mesh3DDescriptor,
    primitiveType: GPUPrimitiveTopology = 'triangle-list',
  ): GeometryData {
    const { vertices, indices = [], bounds } = descriptor;

    // Check if vertices have color data
    const hasColor = vertices.some((vertex) => vertex.color !== undefined);

    // Determine vertex format and stride
    let vertexStride: number;
    let vertexFormat: VertexFormat;

    if (hasColor) {
      // Format: position(3) + color(4) = 7 floats per vertex
      vertexStride = 7;
      vertexFormat = 'colored';
    } else {
      // Format: position(3) + normal(3) + uv(2) = 8 floats per vertex
      vertexStride = 8;
      vertexFormat = 'full';
    }

    // Convert Vertex3D[] to interleaved Float32Array
    const vertexCount = vertices.length;
    const vertexArray = new Float32Array(vertexCount * vertexStride);

    for (let i = 0; i < vertexCount; i++) {
      const vertex = vertices[i];
      const baseIndex = i * vertexStride;

      // Position (x, y, z)
      vertexArray[baseIndex] = vertex.position[0];
      vertexArray[baseIndex + 1] = vertex.position[1];
      vertexArray[baseIndex + 2] = vertex.position[2];

      if (hasColor) {
        // Color (r, g, b, a) - use provided color or default white
        if (vertex.color) {
          vertexArray[baseIndex + 3] = vertex.color[0];
          vertexArray[baseIndex + 4] = vertex.color[1];
          vertexArray[baseIndex + 5] = vertex.color[2];
          vertexArray[baseIndex + 6] = vertex.color[3];
        } else {
          vertexArray[baseIndex + 3] = 1.0; // r
          vertexArray[baseIndex + 4] = 1.0; // g
          vertexArray[baseIndex + 5] = 1.0; // b
          vertexArray[baseIndex + 6] = 1.0; // a
        }
      } else {
        // Normal (nx, ny, nz) - use provided normal or default up vector
        if (vertex.normal) {
          vertexArray[baseIndex + 3] = vertex.normal[0];
          vertexArray[baseIndex + 4] = vertex.normal[1];
          vertexArray[baseIndex + 5] = vertex.normal[2];
        } else {
          vertexArray[baseIndex + 3] = 0;
          vertexArray[baseIndex + 4] = 1;
          vertexArray[baseIndex + 5] = 0;
        }

        // UV (u, v) - use provided UV or default
        if (vertex.uv) {
          vertexArray[baseIndex + 6] = vertex.uv[0];
          vertexArray[baseIndex + 7] = vertex.uv[1];
        } else {
          vertexArray[baseIndex + 6] = 0;
          vertexArray[baseIndex + 7] = 0;
        }
      }
    }

    // Convert indices to Uint16Array
    const indexArray = new Uint16Array(indices);

    // Calculate bounds if not provided
    let calculatedBounds = bounds;
    if (!calculatedBounds) {
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;

      for (const vertex of vertices) {
        const [x, y, z] = vertex.position;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }

      calculatedBounds = {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      };
    }

    return {
      vertices: vertexArray,
      indices: indexArray,
      vertexCount,
      indexCount: indexArray.length,
      vertexFormat,
      primitiveType,
      bounds: calculatedBounds,
    };
  }

  /**
   * Create a cube geometry using primitive-geometry
   * @returns Cube vertex and index data
   */
  static createCube(options: GeometryPrimitiveOptions['cube'] = {}): GeometryData {
    const primitiveData = cube(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a sphere geometry using primitive-geometry
   * @returns Sphere vertex and index data
   */
  static createSphere(options: GeometryPrimitiveOptions['sphere'] = {}): GeometryData {
    const primitiveData = sphere(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a unit plane geometry data using primitive-geometry
   * @returns Unit plane vertex and index data
   */
  static createPlane(options: GeometryPrimitiveOptions['plane'] = {}): GeometryData {
    const primitiveData = plane(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a unit cylinder geometry data using primitive-geometry
   * @returns Unit cylinder vertex and index data
   */
  static createCylinder(options: GeometryPrimitiveOptions['cylinder'] = {}): GeometryData {
    const primitiveData = cylinder(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a unit cone geometry data using primitive-geometry
   * @returns Unit cone vertex and index data
   */
  static createCone(options: GeometryPrimitiveOptions['cone'] = {}): GeometryData {
    const primitiveData = cone(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  // === 2D Shapes ===

  /**
   * Create a quad geometry using primitive-geometry
   * @returns Quad vertex and index data
   */
  static createQuad(options: GeometryPrimitiveOptions['quad'] = {}): GeometryData {
    const primitiveData = quad(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a rounded rectangle geometry using primitive-geometry
   * @returns Rounded rectangle vertex and index data
   */
  static createRoundedRectangle(
    options: GeometryPrimitiveOptions['roundedRectangle'] = {},
  ): GeometryData {
    const primitiveData = roundedRectangle(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a stadium geometry using primitive-geometry
   * @returns Stadium vertex and index data
   */
  static createStadium(options: GeometryPrimitiveOptions['stadium'] = {}): GeometryData {
    const primitiveData = stadium(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create an ellipse geometry using primitive-geometry
   * @returns Ellipse vertex and index data
   */
  static createEllipse(options: GeometryPrimitiveOptions['ellipse'] = {}): GeometryData {
    const primitiveData = ellipse(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a disc geometry using primitive-geometry
   * @returns Disc vertex and index data
   */
  static createDisc(options: GeometryPrimitiveOptions['disc'] = {}): GeometryData {
    const primitiveData = disc(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a circle geometry using primitive-geometry
   * @returns Circle vertex and index data
   */
  static createCircle(options: GeometryPrimitiveOptions['circle'] = {}): GeometryData {
    const primitiveData = circle(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  // === 3D Shapes ===

  /**
   * Create a box geometry using primitive-geometry (without normals/uvs)
   * @returns Box vertex and index data
   */
  static createBox(options: GeometryPrimitiveOptions['box'] = {}): GeometryData {
    const primitiveData = box(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a rounded cube geometry using primitive-geometry
   * @returns Rounded cube vertex and index data
   */
  static createRoundedCube(options: GeometryPrimitiveOptions['roundedCube'] = {}): GeometryData {
    const primitiveData = roundedCube(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create an icosphere geometry using primitive-geometry
   * @returns Icosphere vertex and index data
   */
  static createIcosphere(options: GeometryPrimitiveOptions['icosphere'] = {}): GeometryData {
    const primitiveData = icosphere(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create an ellipsoid geometry using primitive-geometry
   * @returns Ellipsoid vertex and index data
   */
  static createEllipsoid(options: GeometryPrimitiveOptions['ellipsoid'] = {}): GeometryData {
    const primitiveData = ellipsoid(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a capsule geometry using primitive-geometry
   * @returns Capsule vertex and index data
   */
  static createCapsule(options: GeometryPrimitiveOptions['capsule'] = {}): GeometryData {
    const primitiveData = capsule(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a torus geometry using primitive-geometry
   * @returns Torus vertex and index data
   */
  static createTorus(options: GeometryPrimitiveOptions['torus'] = {}): GeometryData {
    const primitiveData = torus(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create a tetrahedron geometry using primitive-geometry
   * @param radius Tetrahedron radius
   * @returns Tetrahedron vertex and index data
   */
  static createTetrahedron(options: GeometryPrimitiveOptions['tetrahedron'] = {}): GeometryData {
    const primitiveData = tetrahedron(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }

  /**
   * Create an icosahedron geometry using primitive-geometry
   * @param radius Icosahedron radius
   * @returns Icosahedron vertex and index data
   */
  static createIcosahedron(options: GeometryPrimitiveOptions['icosahedron'] = {}): GeometryData {
    const primitiveData = icosahedron(options);
    return this.convertPrimitiveGeometry(primitiveData, 'triangle-list');
  }
}
