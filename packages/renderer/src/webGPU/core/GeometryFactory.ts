import { Vec2, Vec3 } from '@ecs/types/types';
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
import { GeometryPrimitiveOptions } from './GeometryManager';

/**
 * 3D vertex data structure
 */
export interface Vertex3D {
  position: Vec3; // Position [x, y, z]
  normal?: Vec3; // Normal vector [nx, ny, nz]
  uv?: Vec2; // UV coordinates [u, v]
  color?: Vec3; // Vertex color [r, g, b]
}

/**
 * Vertex format types.
 * - simple: position only
 * - full: position + normal + uv
 */
export type VertexFormat = 'simple' | 'full';

/**
 * Geometry data
 */
export interface GeometryData {
  vertices: Float32Array;
  indices: Uint16Array;
  vertexCount: number;
  indexCount: number;
  vertexFormat: VertexFormat; // 'simple' for position only, 'full' for pos+normal+uv
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
   * Convert primitive-geometry data to our GeometryData format
   * @param primitiveData Data from primitive-geometry library
   * @returns Converted geometry data
   */
  private static convertPrimitiveGeometry(primitiveData: {
    positions: Float32Array;
    normals?: Float32Array;
    uvs?: Float32Array;
    cells: Uint16Array | Uint8Array | Uint32Array;
  }): GeometryData {
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
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    };
  }
  /**
   * Create a cube geometry using primitive-geometry
   * @returns Cube vertex and index data
   */
  static createCube(options: GeometryPrimitiveOptions['cube'] = {}): GeometryData {
    const primitiveData = cube(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a sphere geometry using primitive-geometry
   * @returns Sphere vertex and index data
   */
  static createSphere(options: GeometryPrimitiveOptions['sphere'] = {}): GeometryData {
    const primitiveData = sphere(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a unit plane geometry data using primitive-geometry
   * @returns Unit plane vertex and index data
   */
  static createPlane(options: GeometryPrimitiveOptions['plane'] = {}): GeometryData {
    const primitiveData = plane(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a unit cylinder geometry data using primitive-geometry
   * @returns Unit cylinder vertex and index data
   */
  static createCylinder(options: GeometryPrimitiveOptions['cylinder'] = {}): GeometryData {
    const primitiveData = cylinder(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a unit cone geometry data using primitive-geometry
   * @returns Unit cone vertex and index data
   */
  static createCone(options: GeometryPrimitiveOptions['cone'] = {}): GeometryData {
    const primitiveData = cone(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  // === 2D Shapes ===

  /**
   * Create a quad geometry using primitive-geometry
   * @returns Quad vertex and index data
   */
  static createQuad(options: GeometryPrimitiveOptions['quad'] = {}): GeometryData {
    const primitiveData = quad(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a rounded rectangle geometry using primitive-geometry
   * @returns Rounded rectangle vertex and index data
   */
  static createRoundedRectangle(
    options: GeometryPrimitiveOptions['roundedRectangle'] = {},
  ): GeometryData {
    const primitiveData = roundedRectangle(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a stadium geometry using primitive-geometry
   * @returns Stadium vertex and index data
   */
  static createStadium(options: GeometryPrimitiveOptions['stadium'] = {}): GeometryData {
    const primitiveData = stadium(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create an ellipse geometry using primitive-geometry
   * @returns Ellipse vertex and index data
   */
  static createEllipse(options: GeometryPrimitiveOptions['ellipse'] = {}): GeometryData {
    const primitiveData = ellipse(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a disc geometry using primitive-geometry
   * @returns Disc vertex and index data
   */
  static createDisc(options: GeometryPrimitiveOptions['disc'] = {}): GeometryData {
    const primitiveData = disc(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a circle geometry using primitive-geometry
   * @returns Circle vertex and index data
   */
  static createCircle(options: GeometryPrimitiveOptions['circle'] = {}): GeometryData {
    const primitiveData = circle(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  // === 3D Shapes ===

  /**
   * Create a box geometry using primitive-geometry (without normals/uvs)
   * @returns Box vertex and index data
   */
  static createBox(options: GeometryPrimitiveOptions['box'] = {}): GeometryData {
    const primitiveData = box(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a rounded cube geometry using primitive-geometry
   * @returns Rounded cube vertex and index data
   */
  static createRoundedCube(options: GeometryPrimitiveOptions['roundedCube'] = {}): GeometryData {
    const primitiveData = roundedCube(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create an icosphere geometry using primitive-geometry
   * @returns Icosphere vertex and index data
   */
  static createIcosphere(options: GeometryPrimitiveOptions['icosphere'] = {}): GeometryData {
    const primitiveData = icosphere(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create an ellipsoid geometry using primitive-geometry
   * @returns Ellipsoid vertex and index data
   */
  static createEllipsoid(options: GeometryPrimitiveOptions['ellipsoid'] = {}): GeometryData {
    const primitiveData = ellipsoid(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a capsule geometry using primitive-geometry
   * @returns Capsule vertex and index data
   */
  static createCapsule(options: GeometryPrimitiveOptions['capsule'] = {}): GeometryData {
    const primitiveData = capsule(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a torus geometry using primitive-geometry
   * @returns Torus vertex and index data
   */
  static createTorus(options: GeometryPrimitiveOptions['torus'] = {}): GeometryData {
    const primitiveData = torus(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create a tetrahedron geometry using primitive-geometry
   * @param radius Tetrahedron radius
   * @returns Tetrahedron vertex and index data
   */
  static createTetrahedron(options: GeometryPrimitiveOptions['tetrahedron'] = {}): GeometryData {
    const primitiveData = tetrahedron(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }

  /**
   * Create an icosahedron geometry using primitive-geometry
   * @param radius Icosahedron radius
   * @returns Icosahedron vertex and index data
   */
  static createIcosahedron(options: GeometryPrimitiveOptions['icosahedron'] = {}): GeometryData {
    const primitiveData = icosahedron(options);
    return this.convertPrimitiveGeometry(primitiveData);
  }
}
