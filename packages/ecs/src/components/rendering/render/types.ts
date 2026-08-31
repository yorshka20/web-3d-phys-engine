import { WebGPUMaterialDescriptor } from '@renderer/material/types';

/**
 * WebGPU-specific rendering properties
 */
export interface WebGPU3DRenderProperties {
  material: WebGPUMaterialDescriptor;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  layer?: number;
  customShader?: string; // Custom shader path/ID (from Render3DComponent)
  uniforms?: Record<string, Any>; // Custom shader uniforms (from Render3DComponent)

  // WebGPU-specific rendering options
  depthTest?: boolean;
  depthWrite?: boolean;
  depthCompare?: GPUCompareFunction;
  stencilTest?: boolean;
  stencilWrite?: boolean;

  // Instancing support
  instanceCount?: number;
  instanceBufferId?: string; // ID of instance buffer in BufferManager

  // LOD (Level of Detail) support
  lodLevel?: number;
  lodDistances?: number[];

  // Frustum culling
  frustumCulling?: boolean;

  // Custom shader overrides
  vertexShaderOverride?: string;
  fragmentShaderOverride?: string;

  // Uniform overrides
  customUniforms?: Record<string, Any>;
}
