import { mat4 } from 'gl-matrix';
import { GLTFMaterial } from '../assets/GltfModel';
import { GeometryData } from '../geometry/GeometryFactory';
import { WebGPUMaterialDescriptor } from '../material/types';
import { Vec3 } from '../types/base';
import { AssetDescriptor, AssetType } from '../webGPU/core/AssetRegistry';
import { PMXMaterialCacheData } from '../webGPU/core/PMXMaterialProcessor';
import { GlobalUniforms, ViewportData } from '../webGPU/types';

// The renderer's input contract: everything it consumes per frame is plain
// data (or a narrow capability interface), never a live ECS entity/component.

export interface CameraData {
  // Transform matrices for vertex transformations
  viewMatrix: Float32Array; // Transforms world space to camera/view space
  projectionMatrix: Float32Array; // Transforms view space to clip space
  viewProjectionMatrix: Float32Array; // Combined matrix: projection * view
  inverseViewMatrix: Float32Array; // Transforms camera space back to world space
  inverseProjectionMatrix: Float32Array; // Transforms clip space back to view space

  // Camera spatial information
  position: Vec3; // Camera position in world space
  forward: Vec3; // Direction the camera is looking (normalized)
  up: Vec3; // Camera's up direction (normalized)
  right: Vec3; // Camera's right direction (normalized)

  // Projection parameters
  fov?: number; // Field of view in degrees (perspective only)
  aspect: number; // Aspect ratio (width/height)
  near: number; // Near clipping plane distance
  far: number; // Far clipping plane distance
}

export enum LightType {
  AMBIENT = 'ambient',
  DIRECTIONAL = 'directional',
  POINT = 'point',
  SPOT = 'spot',
}

export interface BaseLightData {
  type: LightType;
  color: Vec3; // RGB
  intensity: number;
  castShadow: boolean;
}

export interface DirectionalLightData extends BaseLightData {
  type: LightType.DIRECTIONAL;
  direction: Vec3;
  shadowMapSize?: number;
  shadowBias?: number;
}

export interface PointLightData extends BaseLightData {
  type: LightType.POINT;
  position: Vec3;
  range: number; // attenuation range
  attenuation: Vec3; // constant, linear, quadratic
}

export interface SpotLightData extends BaseLightData {
  type: LightType.SPOT;
  position: Vec3;
  direction: Vec3;
  innerCone: number; // inner cone angle
  outerCone: number; // outer cone angle
  range: number;
}

export type LightData = DirectionalLightData | PointLightData | SpotLightData;

/**
 * Capability interface for PMX renderables: whatever produced the RenderData
 * must be able to resolve the registered asset descriptor. This is the only
 * behavior the renderer needs from the ECS side — it must never receive the
 * component itself.
 */
export interface PMXAssetSource {
  resolveAsset<T extends AssetType>(): AssetDescriptor<T> | null;
}

// core render data - replace direct Entity passing
export interface RenderData {
  // Entity information
  entityId: number; // Entity numeric ID for animation and other systems

  type: 'gltf' | 'pmx' | 'mesh';

  // Geometry information
  geometryId: string; // for resource cache
  geometryData: GeometryData;

  // Transform information
  worldMatrix: mat4;
  normalMatrix: mat4; // normal transformation matrix (mat4 for WGSL compatibility)

  // Material information
  material: WebGPUMaterialDescriptor | PMXMaterialCacheData | GLTFMaterial;
  materialUniforms: Record<string, Any>; // material specific uniforms

  // render control
  renderOrder: number; // render order
  castShadow: boolean;
  receiveShadow: boolean;

  computePass?: boolean;

  // PMX model specific (optional)
  pmxAssetId?: string;
  pmxComponent?: PMXAssetSource;
  materialIndex?: number; // Material index for PMX models

  // Animation data (optional)
  boneMatrices?: Float32Array; // Bone transformation matrices
  morphWeights?: Float32Array; // Morph weights
  morphCount?: number; // Actual morph count for shader
  vertexCount?: number; // Vertex count for morph data layout
}

export interface EnvironmentData {
  // ambient light
  ambientColor: Vec3;
  ambientIntensity: number;

  // IBL (Image-Based Lighting)
  skyboxTexture?: string;
  irradianceTexture?: string; // diffuse environment map
  prefilterTexture?: string; // specular environment map
  brdfLUT?: string; // BRDF lookup table

  // fog
  fogColor?: Vec3;
  fogDensity?: number;
  fogNear?: number;
  fogFar?: number;
}

// separated context design
export interface SceneData {
  // scene level data
  camera: CameraData; // extracted camera data, not Entity
  lights: LightData[]; // extracted light data
  environment: EnvironmentData; // environment light, skybox, etc.
}

export interface RenderConfig {
  // render config
  viewport: ViewportData;
  renderMode: 'AUTO' | '2D' | '3D' | 'MIXED';
  enableFrustumCulling: boolean;
  enableOcclusion: boolean;
  maxDrawCalls: number;
}

// new renderContext interface
export interface FrameData {
  scene: SceneData;
  renderables: RenderData[];
  config: RenderConfig;
  globalUniforms: GlobalUniforms;
}
