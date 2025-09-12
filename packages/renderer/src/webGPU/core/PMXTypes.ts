/**
 * PMX Model Types - Type definitions for PMX model data structures
 * Based on mmd-parser types but with proper TypeScript definitions
 */

import { Vec3, Vec4 } from '@ecs';

export interface PMXVertex {
  position: Vec3;
  normal: Vec3;
  uv: [number, number];
  auvs: number[]; // Additional UV channels (empty array in this case)
  type: number;
  skinIndices: Vec4;
  skinWeights: Vec4;
  edgeRatio: number;
}

export interface PMXMaterial {
  name: string;
  nameEn: string;
  diffuse: Vec4;
  specular: Vec3;
  specularPower: number;
  ambient: Vec3;
  flag: number;
  edgeColor: Vec4;
  edgeSize: number;
  textureIndex: number;
  sphereTextureIndex: number;
  sphereMode: number;
  toonTextureIndex: number;
  memo: string;
  faceCount: number;
}

export interface PMXTexture {
  name: string;
  path: string;
}

export interface PMXBone {
  name: string;
  nameEn: string;
  position: Vec3;
  parentIndex: number;
  transformLevel: number;
  flag: number;
  offsetPosition?: Vec3;
  connectionIndex?: number;
  connectionRate?: number;
  additionalTransform?: {
    targetIndex: number;
    rate: number;
  };
  axisVector?: Vec3;
  xAxisVector?: Vec3;
  zAxisVector?: Vec3;
  additionalData?: number[];
}

export interface PMXMorph {
  name: string;
  nameEn: string;
  category: number;
  type: number;
  offsetCount: number;
  offsets: unknown[]; // This would need more specific typing based on morph type
}

export interface PMXDisplayFrame {
  name: string;
  nameEn: string;
  flag: number;
  elements: Array<{
    target: number;
    index: number;
  }>;
}

export interface PMXRigidBody {
  name: string;
  nameEn: string;
  boneIndex: number;
  group: number;
  groupMask: number;
  shape: number;
  size: Vec3;
  position: Vec3;
  rotation: Vec3;
  mass: number;
  linearDamping: number;
  angularDamping: number;
  restitution: number;
  friction: number;
  mode: number;
}

export interface PMXJoint {
  name: string;
  nameEn: string;
  type: number;
  rigidBodyIndexA: number;
  rigidBodyIndexB: number;
  position: Vec3;
  rotation: Vec3;
  linearLowerLimit: Vec3;
  linearUpperLimit: Vec3;
  angularLowerLimit: Vec3;
  angularUpperLimit: Vec3;
  linearSpring: Vec3;
  angularSpring: Vec3;
}

export interface PMXModel {
  header: {
    magic: string;
    version: number;
    globals: {
      encoding: number;
      additionalUVCount: number;
      vertexIndexSize: number;
      textureIndexSize: number;
      materialIndexSize: number;
      boneIndexSize: number;
      morphIndexSize: number;
      rigidBodyIndexSize: number;
    };
  };
  modelName: string;
  modelNameEn: string;
  comment: string;
  commentEn: string;
  vertices: PMXVertex[];
  faces: Array<{ indices: [number, number, number] }>;
  materials: PMXMaterial[];
  textures: PMXTexture[];
  bones: PMXBone[];
  morphs: PMXMorph[];
  displayFrames: PMXDisplayFrame[];
  rigidBodies: PMXRigidBody[];
  joints: PMXJoint[];
}

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
  diffuse: Vec4;
  specular: Vec3;
  specularPower: number;
  ambient: Vec3;
  texturePath?: string;
  sphereTexturePath?: string;
  toonTexturePath?: string;
  alphaMode: 'opaque' | 'mask' | 'blend';
  doubleSided: boolean;
}
