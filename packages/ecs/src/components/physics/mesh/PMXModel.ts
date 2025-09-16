/**
 * PMX Model Types - Type definitions for PMX model data structures
 * Based on actual PMX file analysis with proper TypeScript definitions
 */

import { Vec3, Vec4 } from '@ecs/types/types';
import { mat4 } from 'gl-matrix';

// PMX model metadata interface
export interface PMXMetadata {
  format: string;
  coordinateSystem: string;
  magic: string;
  version: number;
  headerSize: number;
  encoding: number;
  additionalUvNum: number;
  vertexIndexSize: number;
  textureIndexSize: number;
  materialIndexSize: number;
  boneIndexSize: number;
  morphIndexSize: number;
  rigidBodyIndexSize: number;
  modelName: string;
  englishModelName: string;
  comment: string;
  englishComment: string;
  vertexCount: number;
  faceCount: number;
  textureCount: number;
  materialCount: number;
  boneCount: number;
  morphCount: number;
  frameCount: number;
  rigidBodyCount: number;
  constraintCount: number;
}

// PMX vertex data interface
export interface PMXVertex {
  position: [number, number, number]; // x, y, z coordinates
  normal: [number, number, number]; // normal vector nx, ny, nz
  uv: [number, number]; // texture coordinates u, v
  auvs: number[][]; // additional UV coordinates
  type: number; // bone weight type
  skinIndices: [number, number, number, number]; // bone indices
  skinWeights: [number, number, number, number]; // bone weights
  edgeRatio: number; // edge coefficient
}

// PMX face data interface
export interface PMXFace {
  indices: [number, number, number]; // triangle vertex indices
}

// PMX material data interface
export interface PMXMaterial {
  name: string;
  englishName: string;
  diffuse: [number, number, number, number]; // RGBA diffuse color
  specular: [number, number, number]; // RGB specular color
  shininess: number;
  ambient: [number, number, number]; // RGB ambient color
  flag: number; // material flags
  edgeColor: [number, number, number, number]; // RGBA edge color
  edgeSize: number; // edge size
  textureIndex: number; // texture index (-1 for no texture)
  envTextureIndex: number; // environment texture index
  envFlag: number; // environment flags
  toonFlag: number; // toon rendering flag
  toonIndex: number; // toon texture index
  comment: string;
  faceCount: number; // number of faces using this material
}

// PMX texture data interface
export interface PMXTexture {
  name: string;
  path: string;
}

// PMX bone data interface
export interface PMXBone {
  name: string;
  englishName: string;
  position: Vec3; // bone position
  transform?: mat4;
  inverseBindMatrix?: mat4;
  tailPosition?: Vec3; // bone tail position
  parentIndex: number; // parent bone index (-1 for root)
  transformationClass: number; // transformation level
  flag: number; // bone flags
  offsetPosition?: Vec3; // offset position (optional)
  connectIndex?: number; // connected bone index (optional)
}

// PMX morph element interface
export interface PMXMorphElement {
  index: number; // vertex index
  offset?: Vec3; // morph offset
  position: Vec3; // morph position
  rotation: Vec3 | Vec4; // morph rotation. can be quaternion or Euler angles
}

// PMX morph data interface
export interface PMXMorph {
  name: string;
  englishName: string;
  panel: number; // panel type
  type: number; // morph type
  elementCount: number;
  elements: PMXMorphElement[];
}

// PMX frame element interface
export interface PMXFrameElement {
  target: number; // target type (0=bone, 1=morph)
  index: number; // target index
}

// PMX frame data interface
export interface PMXFrame {
  name: string;
  englishName: string;
  type: number; // frame type
  elementCount: number;
  elements: PMXFrameElement[];
}

// PMX rigid body data interface
export interface PMXRigidBody {
  name: string;
  englishName: string;
  boneIndex: number; // associated bone index
  groupIndex: number; // collision group
  groupTarget: number; // collision target group
  shapeType: number; // shape type (0=sphere, 1=box, 2=capsule)
  width: number; // width/radius
  height: number; // height
  depth: number; // depth
  position: [number, number, number]; // position
  rotation: [number, number, number]; // rotation
  weight: number; // mass
  positionDamping: number; // position damping
  rotationDamping: number; // rotation damping
  restitution: number; // restitution
  friction: number; // friction
  type: number; // rigid body type (0=static, 1=dynamic, 2=mixed)
}

// PMX constraint data interface
export interface PMXConstraint {
  name: string;
  englishName: string;
  type: number; // constraint type
  rigidBodyIndex1: number; // rigid body A index
  rigidBodyIndex2: number; // rigid body B index
  position: [number, number, number]; // constraint position
  rotation: [number, number, number]; // constraint rotation
  translationLimitation1: [number, number, number]; // translation limit lower bound
  translationLimitation2: [number, number, number]; // translation limit upper bound
  rotationLimitation1: [number, number, number]; // rotation limit lower bound
  rotationLimitation2: [number, number, number]; // rotation limit upper bound
  springPosition: [number, number, number]; // position spring constants
  springRotation: [number, number, number]; // rotation spring constants
}

// Main PMX model interface
export interface PMXModel {
  metadata: PMXMetadata;
  vertices: PMXVertex[];
  faces: PMXFace[];
  textures: PMXTexture[]; // array of texture objects with name and path
  materials: PMXMaterial[];
  bones: PMXBone[];
  morphs: PMXMorph[];
  frames: PMXFrame[];
  rigidBodies: PMXRigidBody[];
  constraints: PMXConstraint[];
}

// Additional interfaces for WebGPU rendering compatibility
export interface PMXMeshData {
  modelId: string;
  vertices: Float32Array;
  indices: Uint16Array;
  materials: PMXMaterialData[];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface PMXMaterialData {
  materialId: string;
  startIndex: number;
  indexCount: number;
  diffuse: [number, number, number, number];
  specular: [number, number, number];
  specularPower: number;
  ambient: [number, number, number];
  texturePath?: string;
  sphereTexturePath?: string;
  toonTexturePath?: string;
  alphaMode: 'opaque' | 'mask' | 'blend';
  doubleSided: boolean;
}

// Legacy compatibility interfaces for existing code
export interface PMXDisplayFrame {
  name: string;
  nameEn: string;
  flag: number;
  elements: Array<{
    target: number;
    index: number;
  }>;
}

export interface PMXJoint {
  name: string;
  nameEn: string;
  type: number;
  rigidBodyIndexA: number;
  rigidBodyIndexB: number;
  position: [number, number, number];
  rotation: [number, number, number];
  linearLowerLimit: [number, number, number];
  linearUpperLimit: [number, number, number];
  angularLowerLimit: [number, number, number];
  angularUpperLimit: [number, number, number];
  linearSpring: [number, number, number];
  angularSpring: [number, number, number];
}
