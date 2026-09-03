import { AlphaMode, BaseMaterial } from '../material/types';
import { HGRPMaterialDescriptor } from '../material/hgrp';
import { mat4 } from 'gl-matrix';
import { GeometryData } from '../geometry/GeometryFactory';

// A glTF document material converted for rendering: either the standard PBR family or an
// externally-joined family (HGRP presets keyed by material name).
export type GLTFPrimitiveMaterial = GLTFMaterial | HGRPMaterialDescriptor;

// Minimal CPU-side representation for GLTF
export interface GLTFPrimitive {
  geometry: GeometryData; // interleaved vertices [pos, normal, uv]
  material: GLTFPrimitiveMaterial;
}

export interface GLTFMesh {
  primitives: GLTFPrimitive[];
}
// A glTF primitive may legally reference no material (glTF 2.0 §3.7.2.1), in which case the
// spec's default material applies. It is resolved here, once, rather than at every draw:
// materialKey is what every GPU-resource cache is keyed by, so the absence has to become one
// shared identity — a per-entity stand-in would allocate an identical bind group per entity.
// The factors are the spec defaults; note metallic and roughness are 1, not the 0/0.5 a
// hand-written placeholder tends to carry.
export const GLTF_DEFAULT_MATERIAL: GLTFMaterial = {
  baseColorFactor: [1, 1, 1, 1],
  metallicFactor: 1,
  roughnessFactor: 1,
  emissiveFactor: [0, 0, 0],
  alphaMode: 'opaque',
  alphaCutoff: 0.5,
  doubleSided: false,
  normalScale: 1,
  occlusionStrength: 1,
  materialType: 'gltf',
  customShaderId: 'gltf_material_shader',
  materialKey: 'gltf_default_material',
};

// One scene node that references a mesh, flattened at load time with its world transform
// baked in. Several instances may share one meshIndex (glTF mesh reuse across nodes), so
// consumers must treat meshes as shared data and carry the transform per instance.
export interface GLTFMeshInstance {
  meshIndex: number;
  worldMatrix: mat4;
  // Index into GLTFModel.skins. A skinned instance is posed entirely by its joint palette:
  // worldMatrix is identity for it (glTF 2.0 §3.7.3.2 ignores the node transform).
  skinIndex?: number;
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
  // The scene graph, present only when the document is skinned or animated: posing needs the
  // node hierarchy alive, whereas a static model has its transforms flattened into instances.
  nodes?: GLTFNode[];
  roots?: number[]; // default-scene root node indices
  animations?: GLTFAnimation[];
  skins?: GLTFSkin[];
}

// A node keeps its local transform as TRS rather than a matrix: animation channels drive
// translation/rotation/scale independently, and a matrix would have to be decomposed back.
export interface GLTFNode {
  name: string;
  translation: [number, number, number];
  rotation: [number, number, number, number]; // quaternion xyzw
  scale: [number, number, number];
  children: number[]; // child node indices
}

export interface GLTFSkin {
  joints: number[]; // joint node indices, in palette order
  inverseBindMatrices: Float32Array; // 16 floats per joint, palette order
}

export interface GLTFAnimationSampler {
  input: Float32Array; // keyframe times, seconds
  output: Float32Array; // keyframe values (3/4 floats per key, ×3 for CUBICSPLINE)
  interpolation: 'STEP' | 'LINEAR' | 'CUBICSPLINE';
}

export interface GLTFAnimationChannel {
  node: number;
  path: 'translation' | 'rotation' | 'scale' | 'weights';
  sampler: number; // index into GLTFAnimation.samplers
}

export interface GLTFAnimation {
  name: string;
  channels: GLTFAnimationChannel[];
  // Samplers are shared between channels in real documents, so they stay a separate list
  // instead of being inlined per channel.
  samplers: GLTFAnimationSampler[];
  duration: number; // seconds, max sampler input
}
