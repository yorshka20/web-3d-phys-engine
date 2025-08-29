import { GeometryData } from '@ecs/components/physics/mesh';
import { CameraData, LightData, Material3D } from '@ecs/components/rendering';
import { Vec3 } from '@ecs/types/types';
import { GlobalUniforms, ViewportData } from '@renderer/webGPU/types';
import { mat3, mat4 } from 'gl-matrix';

// core render data - replace direct Entity passing
export interface RenderData {
  // Geometry information
  geometryId: string; // for resource cache
  geometryData: GeometryData;

  // Transform information
  worldMatrix: mat4;
  normalMatrix: mat3; // normal transformation matrix

  // Material information
  material: Material3D;
  materialUniforms: Record<string, Any>; // material specific uniforms

  // render control
  renderOrder: number; // render order
  castShadow: boolean;
  receiveShadow: boolean;

  // render task type. could be batch tag.
  type: string;
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
