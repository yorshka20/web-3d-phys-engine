import { BufferManager } from './BufferManager';
import { SHADER_PARAMS_BINDING, shaderParamsLayout } from './shaders/params';
import { BufferType } from './types';

export const MATERIAL_BIND_GROUP_LAYOUT_ID = 'materialBindGroupLayout';

// Group 3 of the regular material family. Binding 0 is the shared PBR MaterialUniforms struct;
// binding 1 is the block a shader module declares through `runtimeParams` (shaders/params.ts).
// The params entry is unconditional so that one layout serves every regular pipeline — a shader
// that declares no params simply does not reference the binding, which an explicit pipeline
// layout allows, and its bind group points at the shared empty buffer.
//
// This array is the only declaration of that layout. Both live creation sites (BindGroupManager's
// defaults and WebGPURenderer.init) go through it, because BindGroupManager caches layouts by id:
// a second entry list would silently win or lose depending on which site ran first.
export const MATERIAL_BIND_GROUP_LAYOUT_ENTRIES: GPUBindGroupLayoutEntry[] = [
  {
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: { type: 'uniform' },
  },
  {
    binding: SHADER_PARAMS_BINDING,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: { type: 'uniform' },
  },
];

const EMPTY_SHADER_PARAMS_BUFFER_ID = 'empty_shader_params_buffer';

// Stands in at binding 1 for every material whose shader declares no params. One buffer for the
// whole renderer: a uniform binding cannot be left unset, and its contents are never read.
export function createEmptyShaderParamsBuffer(bufferManager: BufferManager): GPUBuffer {
  return bufferManager.createCustomBuffer(EMPTY_SHADER_PARAMS_BUFFER_ID, {
    type: BufferType.UNIFORM,
    size: shaderParamsLayout(undefined).byteSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}
