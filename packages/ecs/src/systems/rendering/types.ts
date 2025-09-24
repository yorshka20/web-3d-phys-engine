import { GeometryData } from '@ecs/components/physics/mesh';
import { GLTFMaterial } from '@ecs/components/physics/mesh/GltfModel';
import { PMXMeshComponent } from '@ecs/components/physics/mesh/PMXMeshComponent';
import { CameraData, LightData, WebGPUMaterialDescriptor } from '@ecs/components/rendering';
import { Vec3 } from '@ecs/types/types';
import { PMXMaterialCacheData } from '@renderer/webGPU/core/PMXMaterialProcessor';
import { GlobalUniforms, ViewportData } from '@renderer/webGPU/types';
import { mat4 } from 'gl-matrix';

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
  pmxComponent?: PMXMeshComponent;
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
