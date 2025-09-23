import { mat4 } from 'gl-matrix';
import { GeometryData } from './GeometryFactory';

// Minimal CPU-side representation for GLTF
export interface GLTFPrimitive {
  geometry: GeometryData; // interleaved vertices [pos, normal, uv]
  material?: {
    baseColorTexture?: string; // texture asset id (URL or resolved id)
  };
}

export interface GLTFModel {
  primitives: GLTFPrimitive[];
  nodes?: GLTFNode[]; // scene graph
  animations?: GLTFAnimation[]; // animations
  skins?: GLTFSkin[]; // skinning data
}

export interface GLTFNode {
  name?: string;
  transform: mat4; // local transform
  children: number[]; // child node indices
  mesh?: number; // mesh index if this node has geometry
}

export interface GLTFSkin {
  joints: number[]; // joint node indices
  inverseBindMatrices: mat4[]; // inverse bind matrices
}

export interface GLTFAnimation {
  name?: string;
  channels: GLTFAnimationChannel[];
}

export interface GLTFAnimationChannel {
  target: { node: number; path: 'translation' | 'rotation' | 'scale' };
  sampler: { input: Float32Array; output: Float32Array; interpolation: string };
}
