import { Vec2, Vec3 } from '@ecs/types/types';

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
 * Geometry data
 */
export interface GeometryData {
  vertices: Float32Array;
  indices: Uint16Array;
  vertexCount: number;
  indexCount: number;
  bounds: {
    min: Vec3;
    max: Vec3;
  };
}

/**
 * Geometry Factory Class
 * Used to generate common 3D geometry data
 */
export class GeometryFactory {
  /**
   * Create a unit cube geometry data
   * @param size Cube size is 1x1x1
   * @returns Cube vertex and index data
   */
  static createCube(): GeometryData {
    const halfSize = 0.5;

    // Vertex data: 24 vertices (4 vertices per face)
    // prettier-ignore
    const vertices = new Float32Array([
      // Front face (Z+)
      -halfSize, -halfSize,  halfSize,  // 0
       halfSize, -halfSize,  halfSize,  // 1
       halfSize,  halfSize,  halfSize,  // 2
      -halfSize,  halfSize,  halfSize,  // 3

      // Back face (Z-)
      -halfSize, -halfSize, -halfSize,  // 4
      -halfSize,  halfSize, -halfSize,  // 5
       halfSize,  halfSize, -halfSize,  // 6
       halfSize, -halfSize, -halfSize,  // 7

      // Top face (Y+)
      -halfSize,  halfSize, -halfSize,  // 8
      -halfSize,  halfSize,  halfSize,  // 9
       halfSize,  halfSize,  halfSize,  // 10
       halfSize,  halfSize, -halfSize,  // 11

      // Bottom face (Y-)
      -halfSize, -halfSize, -halfSize,  // 12
       halfSize, -halfSize, -halfSize,  // 13
       halfSize, -halfSize,  halfSize,  // 14
      -halfSize, -halfSize,  halfSize,  // 15

      // Right face (X+)
       halfSize, -halfSize, -halfSize,  // 16
       halfSize,  halfSize, -halfSize,  // 17
       halfSize,  halfSize,  halfSize,  // 18
       halfSize, -halfSize,  halfSize,  // 19

      // Left face (X-)
      -halfSize, -halfSize, -halfSize,  // 20
      -halfSize, -halfSize,  halfSize,  // 21
      -halfSize,  halfSize,  halfSize,  // 22
      -halfSize,  halfSize, -halfSize,  // 23
    ]);

    // Index data: 36 indices (6 faces, 2 triangles per face)
    // prettier-ignore
    const indices = new Uint16Array([
      0,  1,  2,   2,  3,  0,   // Front face
      4,  5,  6,   6,  7,  4,   // Back face
      8,  9,  10,  10, 11, 8,   // Top face
      12, 13, 14,  14, 15, 12,  // Bottom face
      16, 17, 18,  18, 19, 16,  // Right face
      20, 21, 22,  22, 23, 20,  // Left face
    ]);

    return {
      vertices,
      indices,
      vertexCount: 24,
      indexCount: 36,
      bounds: {
        min: [-halfSize, -halfSize, -halfSize],
        max: [halfSize, halfSize, halfSize],
      },
    };
  }

  /**
   * Create a unit sphere geometry data (radius = 0.5)
   * @param segments Sphere segments
   * @returns Unit sphere vertex and index data
   */
  static createSphere(segments: number = 32): GeometryData {
    const radius = 0.5;
    const vertices: number[] = [];
    const indices: number[] = [];

    // Generate sphere vertices
    for (let lat = 0; lat <= segments; lat++) {
      const theta = (lat * Math.PI) / segments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= segments; lon++) {
        const phi = (lon * 2 * Math.PI) / segments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        vertices.push(
          x * radius, // position x
          y * radius, // position y
          z * radius, // position z
          x, // normal x
          y, // normal y
          z, // normal z
          lon / segments, // uv u
          lat / segments, // uv v
        );
      }
    }

    // Generate sphere indices
    for (let lat = 0; lat < segments; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const current = lat * (segments + 1) + lon;
        const next = current + segments + 1;

        indices.push(current, next, current + 1);
        indices.push(next, next + 1, current + 1);
      }
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 8, // 8 floats per vertex (pos + normal + uv)
      indexCount: indices.length,
      bounds: {
        min: [-radius, -radius, -radius],
        max: [radius, radius, radius],
      },
    };
  }

  /**
   * Create a unit plane geometry data (1x1)
   * @param segments Plane segments
   * @returns Unit plane vertex and index data
   */
  static createPlane(segments: number = 1): GeometryData {
    const vertices: number[] = [];
    const indices: number[] = [];

    const width = 1.0;
    const height = 1.0;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;

    // Generate plane vertices
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const xPos = (x / segments - 0.5) * width;
        const zPos = (z / segments - 0.5) * height;

        vertices.push(
          xPos, // position x
          0, // position y
          zPos, // position z
          0, // normal x
          1, // normal y
          0, // normal z
          x / segments, // uv u
          z / segments, // uv v
        );
      }
    }

    // Generate plane indices
    for (let z = 0; z < segments; z++) {
      for (let x = 0; x < segments; x++) {
        const current = z * (segments + 1) + x;
        const next = current + segments + 1;

        indices.push(current, next, current + 1);
        indices.push(next, next + 1, current + 1);
      }
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 8,
      indexCount: indices.length,
      bounds: {
        min: [-halfWidth, 0, -halfHeight],
        max: [halfWidth, 0, halfHeight],
      },
    };
  }

  /**
   * Create a unit cylinder geometry data (radius = 0.5, height = 1.0)
   * @param segments Cylinder segments
   * @returns Unit cylinder vertex and index data
   */
  static createCylinder(segments: number = 32): GeometryData {
    const radius = 0.5;
    const height = 1.0;
    const vertices: number[] = [];
    const indices: number[] = [];

    const halfHeight = height * 0.5;

    // Generate cylinder side vertices
    for (let i = 0; i <= segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Bottom vertices
      // prettier-ignore
      vertices.push(
        x, -halfHeight, z, // position
        x / radius, 0, z / radius, // normal
        i / segments, 0, // uv
      );

      // Top vertices
      // prettier-ignore
      vertices.push(
        x, halfHeight, z, // position
        x / radius, 0, z / radius, // normal
        i / segments, 1, // uv
      );
    }

    // Generate side indices
    for (let i = 0; i < segments; i++) {
      const current = i * 2;
      const next = (i + 1) * 2;

      indices.push(current, next, current + 1);
      indices.push(next, next + 1, current + 1);
    }

    // Add top and bottom faces
    const topCenter = vertices.length / 8;
    const bottomCenter = topCenter + 1;

    // Top face center point
    vertices.push(0, halfHeight, 0, 0, 1, 0, 0.5, 0.5);
    // Bottom face center point
    vertices.push(0, -halfHeight, 0, 0, -1, 0, 0.5, 0.5);

    // Generate top and bottom face indices
    for (let i = 0; i < segments; i++) {
      const current = i * 2;
      const next = ((i + 1) % segments) * 2;

      // Top face triangles
      indices.push(topCenter, next, current);
      // Bottom face triangles
      indices.push(bottomCenter, current + 1, next + 1);
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 8,
      indexCount: indices.length,
      bounds: {
        min: [-radius, -halfHeight, -radius],
        max: [radius, halfHeight, radius],
      },
    };
  }

  /**
   * Create a unit cone geometry data (radius = 0.5, height = 1.0)
   * @param segments Cone segments
   * @returns Unit cone vertex and index data
   */
  static createCone(segments: number = 32): GeometryData {
    const radius = 0.5;
    const height = 1.0;
    const vertices: number[] = [];
    const indices: number[] = [];

    const halfHeight = height * 0.5;

    // Apex vertex
    vertices.push(0, halfHeight, 0, 0, 1, 0, 0.5, 1); // Apex

    // Base circle vertices
    for (let i = 0; i <= segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // prettier-ignore
      vertices.push(
        x, -halfHeight, z, // position
        0, -1, 0,          // normal
        i / segments, 0,   // uv
      );
    }

    // Side indices
    for (let i = 0; i < segments; i++) {
      indices.push(0, i + 1, ((i + 1) % segments) + 1);
    }

    // Base indices
    for (let i = 1; i < segments - 1; i++) {
      indices.push(1, i + 1, i + 2);
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 8,
      indexCount: indices.length,
      bounds: {
        min: [-radius, -halfHeight, -radius],
        max: [radius, halfHeight, radius],
      },
    };
  }
}
