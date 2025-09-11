import { Vec2, Vec3, Vec4 } from '@ecs/types/types';
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

/**
 * 3D vertex data structure
 */
export interface Vertex3D {
  position: Vec3; // Position [x, y, z]
  normal?: Vec3; // Normal vector [nx, ny, nz]
  uv?: Vec2; // UV coordinates [u, v]
  color?: Vec4; // Vertex color [r, g, b, a]
}

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

export type GeometryType = keyof GeometryPrimitiveOptions;

// base geometry descriptor
export interface BoxDescriptor {
  type: 'box';
  params: GeometryPrimitiveOptions['box'];
}

export interface SphereDescriptor {
  type: 'sphere';
  params: GeometryPrimitiveOptions['sphere'];
}

export interface CylinderDescriptor {
  type: 'cylinder';
  params: GeometryPrimitiveOptions['cylinder'];
}

export interface PlaneDescriptor {
  type: 'plane';
  params: GeometryPrimitiveOptions['plane'];
}

export interface ConeDescriptor {
  type: 'cone';
  params: GeometryPrimitiveOptions['cone'];
}

export interface CubeDescriptor {
  type: 'cube';
  params: GeometryPrimitiveOptions['cube'];
}

export interface IcosphereDescriptor {
  type: 'icosphere';
  params: GeometryPrimitiveOptions['icosphere'];
}

export interface EllipsoidDescriptor {
  type: 'ellipsoid';
  params: GeometryPrimitiveOptions['ellipsoid'];
}

export interface CapsuleDescriptor {
  type: 'capsule';
  params: GeometryPrimitiveOptions['capsule'];
}

export interface TorusDescriptor {
  type: 'torus';
  params: GeometryPrimitiveOptions['torus'];
}

export interface TetrahedronDescriptor {
  type: 'tetrahedron';
  params: GeometryPrimitiveOptions['tetrahedron'];
}

export interface IcosahedronDescriptor {
  type: 'icosahedron';
  params: GeometryPrimitiveOptions['icosahedron'];
}

export interface QuadDescriptor {
  type: 'quad';
  params: GeometryPrimitiveOptions['quad'];
}

export interface RoundedCubeDescriptor {
  type: 'roundedCube';
  params: GeometryPrimitiveOptions['roundedCube'];
}

export interface EllipseDescriptor {
  type: 'ellipse';
  params: GeometryPrimitiveOptions['ellipse'];
}

export interface DiscDescriptor {
  type: 'disc';
  params: GeometryPrimitiveOptions['disc'];
}

export interface CircleDescriptor {
  type: 'circle';
  params: GeometryPrimitiveOptions['circle'];
}

export interface RoundedRectangleDescriptor {
  type: 'roundedRectangle';
  params: GeometryPrimitiveOptions['roundedRectangle'];
}

export interface StadiumDescriptor {
  type: 'stadium';
  params: GeometryPrimitiveOptions['stadium'];
}

// 3d mesh descriptor
export interface Mesh3DDescriptor {
  type: 'mesh';
  vertices: Vertex3D[];
  indices?: number[]; // indices array, for triangle drawing
  primitiveType?: GPUPrimitiveTopology; // primitive type
  bounds?: {
    min: Vec3;
    max: Vec3;
  };
  params?: undefined;
}

// Generic mesh descriptor that supports type-safe geometry parameters
export interface Mesh3DShapeDescriptor<T extends GeometryType = GeometryType> {
  type: T;
  params?: GeometryPrimitiveOptions[T];
  primitiveType?: GPUPrimitiveTopology;
}

// Special case for unset and custom mesh
export type Mesh3DUnsetDescriptor = {
  type: 'unset';
  params?: undefined;
  primitiveType?: GPUPrimitiveTopology;
};
export type Mesh3DCustomDescriptor = Mesh3DDescriptor;

// Union type for all possible mesh descriptors
export type AnyMesh3DShapeDescriptor =
  | Mesh3DUnsetDescriptor
  | Mesh3DCustomDescriptor
  | Mesh3DShapeDescriptor;

// Type-safe geometry descriptor mapping
export type GeometryDescriptorMap = {
  [K in GeometryType]: Mesh3DShapeDescriptor<K>;
};

// Helper type to extract geometry type from descriptor
export type ExtractGeometryType<T> = T extends Mesh3DShapeDescriptor<infer U> ? U : never;

// Helper type to extract params type from descriptor
export type ExtractParamsType<T> =
  T extends Mesh3DShapeDescriptor<infer U> ? GeometryPrimitiveOptions[U] : never;
