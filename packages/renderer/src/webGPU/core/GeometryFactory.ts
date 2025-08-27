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
    // Format: [x, y, z, nx, ny, nz, u, v] - 8 floats per vertex
    // prettier-ignore
    const vertices = new Float32Array([
    // Front face (Z+) - normal: (0, 0, 1)
    -halfSize, -halfSize,  halfSize,  0, 0, 1,  0, 0,  // 0: left bottom
     halfSize, -halfSize,  halfSize,  0, 0, 1,  1, 0,  // 1: right bottom
     halfSize,  halfSize,  halfSize,  0, 0, 1,  1, 1,  // 2: right top
    -halfSize,  halfSize,  halfSize,  0, 0, 1,  0, 1,  // 3: left top

    // Back face (Z-) - normal: (0, 0, -1)
    -halfSize, -halfSize, -halfSize,  0, 0, -1,  1, 0,  // 4: left bottom
    -halfSize,  halfSize, -halfSize,  0, 0, -1,  1, 1,  // 5: left top
     halfSize,  halfSize, -halfSize,  0, 0, -1,  0, 1,  // 6: right top
     halfSize, -halfSize, -halfSize,  0, 0, -1,  0, 0,  // 7: right bottom

    // Top face (Y+) - normal: (0, 1, 0)
    -halfSize,  halfSize, -halfSize,  0, 1, 0,  0, 1,   // 8: left back
    -halfSize,  halfSize,  halfSize,  0, 1, 0,  0, 0,   // 9: left front
     halfSize,  halfSize,  halfSize,  0, 1, 0,  1, 0,   // 10: right front
     halfSize,  halfSize, -halfSize,  0, 1, 0,  1, 1,   // 11: right back

    // Bottom face (Y-) - normal: (0, -1, 0)
    -halfSize, -halfSize, -halfSize,  0, -1, 0,  0, 0,  // 12: left back
     halfSize, -halfSize, -halfSize,  0, -1, 0,  1, 0,  // 13: right back
     halfSize, -halfSize,  halfSize,  0, -1, 0,  1, 1,  // 14: right front
    -halfSize, -halfSize,  halfSize,  0, -1, 0,  0, 1,  // 15: left front

    // Right face (X+) - normal: (1, 0, 0)
     halfSize, -halfSize, -halfSize,  1, 0, 0,  0, 0,   // 16: bottom back
     halfSize,  halfSize, -halfSize,  1, 0, 0,  0, 1,   // 17: top back
     halfSize,  halfSize,  halfSize,  1, 0, 0,  1, 1,   // 18: top front
     halfSize, -halfSize,  halfSize,  1, 0, 0,  1, 0,   // 19: bottom front

    // Left face (X-) - normal: (-1, 0, 0)
    -halfSize, -halfSize, -halfSize,  -1, 0, 0,  1, 0,  // 20: bottom back
    -halfSize, -halfSize,  halfSize,  -1, 0, 0,  0, 0,  // 21: bottom front
    -halfSize,  halfSize,  halfSize,  -1, 0, 0,  0, 1,  // 22: top front
    -halfSize,  halfSize, -halfSize,  -1, 0, 0,  1, 1,  // 23: top back
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
      vertexFormat: 'full' as VertexFormat, // position + normal + uv (8 floats)
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
      vertexFormat: 'full' as VertexFormat, // pos + normal + uv
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
      vertexCount: vertices.length / 8, // 8 floats per vertex (pos + normal + uv)
      indexCount: indices.length,
      vertexFormat: 'full' as VertexFormat, // pos + normal + uv
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
      vertices.push(
        x,
        -halfHeight,
        z, // position
        x / radius,
        0,
        z / radius, // normal (normalized)
        i / segments,
        0, // uv
      );

      // Top vertices
      vertices.push(
        x,
        halfHeight,
        z, // position
        x / radius,
        0,
        z / radius, // normal (normalized)
        i / segments,
        1, // uv
      );
    }

    // Generate side indices
    for (let i = 0; i < segments; i++) {
      const current = i * 2;
      const next = (i + 1) * 2;

      // Side face triangles (counter-clockwise)
      indices.push(current, next, current + 1);
      indices.push(next, next + 1, current + 1);
    }

    // Add top and bottom center vertices
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

      // Top face triangles (counter-clockwise from above)
      indices.push(topCenter, current + 1, next + 1);

      // Bottom face triangles (clockwise from below = counter-clockwise from above)
      indices.push(bottomCenter, next, current);
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 8, // 8 floats per vertex (pos + normal + uv)
      indexCount: indices.length,
      vertexFormat: 'full' as VertexFormat, // pos + normal + uv
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
      vertexCount: vertices.length / 8, // 8 floats per vertex (pos + normal + uv)
      indexCount: indices.length,
      vertexFormat: 'full' as VertexFormat, // pos + normal + uv
      bounds: {
        min: [-radius, -halfHeight, -radius],
        max: [radius, halfHeight, radius],
      },
    };
  }
}
