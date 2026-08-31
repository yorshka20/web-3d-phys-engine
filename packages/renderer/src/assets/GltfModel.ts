import { AlphaMode, BaseMaterial } from '../material/types';
import { mat4 } from 'gl-matrix';
import { GeometryData } from '../geometry/GeometryFactory';

// Minimal CPU-side representation for GLTF
export interface GLTFPrimitive {
  geometry: GeometryData; // interleaved vertices [pos, normal, uv]
  material?: GLTFMaterial;
}

export interface GLTFMesh {
  primitives: GLTFPrimitive[];
}

// One scene node that references a mesh, flattened at load time with its world transform
// baked in. Several instances may share one meshIndex (glTF mesh reuse across nodes), so
// consumers must treat meshes as shared data and carry the transform per instance.
export interface GLTFMeshInstance {
  meshIndex: number;
  worldMatrix: mat4;
}

export interface GLTFMaterial extends BaseMaterial {
  // PBR metallic roughness workflow
  baseColorFactor: [number, number, number, number];
  baseColorTexture?: string;

  metallicFactor: number;
  roughnessFactor: number;
  metallicRoughnessTexture?: string; // R=unused G=roughness B=metallic

  normalTexture?: string;
  normalScale?: number;

  occlusionTexture?: string;
  occlusionStrength?: number;

  emissiveTexture?: string;
  emissiveFactor: [number, number, number];

  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;

  materialType: 'gltf';

  // Stable identity of the source document material (glTF materials are document-level and
  // shared across primitives); keys material GPU-resource caches downstream.
  materialKey: string;
}

export interface GLTFModel {
  meshes: GLTFMesh[];
  instances: GLTFMeshInstance[]; // flattened default-scene nodes that carry a mesh
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
