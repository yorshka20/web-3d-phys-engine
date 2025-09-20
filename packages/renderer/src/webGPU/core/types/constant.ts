/**
 * shader type enum
 */
export enum ShaderType {
  VERTEX = 'vertex',
  FRAGMENT = 'fragment',
  COMPUTE = 'compute',
}

/**
 * bind group layout visibility enum
 */
export enum BindGroupLayoutVisibility {
  VERTEX = 1,
  FRAGMENT = 2,
  VERTEX_FRAGMENT = 3,
  COMPUTE = 4,
}

/**
 * buffer type enum
 */
export enum BufferType {
  VERTEX = 'vertex',
  INDEX = 'index',
  UNIFORM = 'uniform',
  STORAGE = 'storage',
  STAGING = 'staging',
  COPY_SRC = 'copy_src',
  COPY_DST = 'copy_dst',
}

/**
 * WebGPU resource types
 */
export enum ResourceType {
  BUFFER = 'buffer',
  SHADER = 'shader',
  PIPELINE = 'pipeline',
  BIND_GROUP_LAYOUT = 'bind_group_layout',
  BIND_GROUP = 'bind_group',
  TEXTURE = 'texture',
  SAMPLER = 'sampler',
  GEOMETRY = 'geometry',
  GPU_RESOURCE = 'gpu_resource',
}

/**
 * Resource states
 */
export enum ResourceState {
  PENDING = 'pending',
  CREATING = 'creating',
  READY = 'ready',
  ERROR = 'error',
  DESTROYED = 'destroyed',
}
