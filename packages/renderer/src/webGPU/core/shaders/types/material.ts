import { VertexFormat } from '@ecs/components/physics/mesh';
import { ShaderModule, ShaderParamDefinition } from './shader';

/**
 * PMX Material Shader Module Definition
 */
export interface PMXMaterialShaderModule extends ShaderModule {
  id: 'pmx_material_shader';
  name: 'PMX Material Shader';
  description: 'PMX model material shader with multi-texture support and PMX-specific features';
  type: 'render';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: {
      ENABLE_TOON_SHADING?: boolean;
      ENABLE_NORMAL_MAPPING?: boolean;
      ENABLE_ENVIRONMENT_MAPPING?: boolean;
    };
    optimization?: 'performance';
    debug?: boolean;
  };
  runtimeParams: {
    toonShading: ShaderParamDefinition;
    normalMapping: ShaderParamDefinition;
    environmentMapping: ShaderParamDefinition;
  };
  renderState: {
    blendMode: 'alpha-blend';
    depthTest: true;
    depthWrite: true;
    cullMode: 'back';
    frontFace: 'cw';
    sampleCount: 1;
  };
  version: string;
  author: string;
  tags: string[];
}

/**
 * PMX Morph Compute Shader Module Definition
 */
export interface PMXMorphComputeShaderModule extends ShaderModule {
  id: 'pmx_morph_compute_shader';
  name: 'PMX Morph Compute Shader';
  description: 'PMX morph compute shader';
  type: 'compute';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: {
      ENABLE_PMX_MORPH_COMPUTE?: boolean;
      ENABLE_MORPH_PROCESSING?: boolean;
    };
  };
  runtimeParams: Record<string, never>;
  renderState: {
    blendMode: 'alpha-blend';
    depthTest: true;
    depthWrite: true;
    cullMode: 'back';
    frontFace: 'ccw';
    sampleCount: 1;
  };
  version: string;
  author: string;
  tags: string[];
}

/**
 * Default parameter definitions for PMX Material
 */
export const PMX_MATERIAL_DEFAULT_PARAMS = {
  toonShading: {
    type: 'f32' as const,
    defaultValue: 1.0,
    description: 'Enable toon shading effect',
    min: 0.0,
    max: 1.0,
    step: 1.0,
  },
  normalMapping: {
    type: 'f32' as const,
    defaultValue: 1.0,
    description: 'Enable normal mapping',
    min: 0.0,
    max: 1.0,
    step: 1.0,
  },
  environmentMapping: {
    type: 'f32' as const,
    defaultValue: 0.0,
    description: 'Enable environment mapping',
    min: 0.0,
    max: 1.0,
    step: 1.0,
  },
};

/**
 * Water Material Shader Module Definition
 */
export interface WaterMaterialShaderModule extends ShaderModule {
  id: 'water_material_shader';
  name: 'Water Material Shader';
  description: 'Animated water with wave effects and fresnel reflection';
  type: 'render';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: {
      ENABLE_WAVE_ANIMATION?: boolean;
      ENABLE_FRESNEL?: boolean;
    };
    optimization?: 'performance';
    debug?: boolean;
  };
  runtimeParams: {
    waveFrequency: ShaderParamDefinition;
    waveSpeed: ShaderParamDefinition;
    waveAmplitude: ShaderParamDefinition;
    fresnelPower: ShaderParamDefinition;
    waterOpacity: ShaderParamDefinition;
  };
  renderState: {
    blendMode: 'alpha-blend';
    depthTest: true;
    depthWrite: false;
    cullMode: 'none';
    frontFace: 'ccw';
    sampleCount: 1;
  };
  version: string;
  author: string;
  tags: string[];
}

/**
 * Fire Material Shader Module Definition
 */
export interface FireMaterialShaderModule extends ShaderModule {
  id: 'fire_material_shader';
  name: 'Fire Material Shader';
  description: 'Flickering fire with distortion and color gradients';
  type: 'render';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: {
      ENABLE_FLICKER?: boolean;
      ENABLE_DISTORTION?: boolean;
    };
    optimization?: 'performance';
    debug?: boolean;
  };
  runtimeParams: {
    flickerSpeed: ShaderParamDefinition;
    flickerIntensity: ShaderParamDefinition;
    distortionStrength: ShaderParamDefinition;
    fireOpacity: ShaderParamDefinition;
  };
  renderState: {
    blendMode: 'alpha-blend';
    depthTest: true;
    depthWrite: false;
    cullMode: 'none';
    frontFace: 'ccw';
    sampleCount: 1;
  };
  version: string;
  author: string;
  tags: string[];
}

/**
 * Default parameter definitions for Water Material
 */
export const WATER_MATERIAL_DEFAULT_PARAMS = {
  waveFrequency: {
    type: 'f32' as const,
    defaultValue: 0.1,
    description: 'Frequency of wave animation',
    min: 0.0,
    max: 1.0,
    step: 0.01,
  },
  waveSpeed: {
    type: 'f32' as const,
    defaultValue: 1.0,
    description: 'Speed of wave animation',
    min: 0.0,
    max: 5.0,
    step: 0.1,
  },
  waveAmplitude: {
    type: 'f32' as const,
    defaultValue: 0.1,
    description: 'Amplitude of wave animation',
    min: 0.0,
    max: 1.0,
    step: 0.01,
  },
  fresnelPower: {
    type: 'f32' as const,
    defaultValue: 2.0,
    description: 'Power of fresnel effect',
    min: 0.1,
    max: 10.0,
    step: 0.1,
  },
  waterOpacity: {
    type: 'f32' as const,
    defaultValue: 0.8,
    description: 'Opacity of water surface',
    min: 0.0,
    max: 1.0,
    step: 0.01,
  },
};

/**
 * Default parameter definitions for Fire Material
 */
export const FIRE_MATERIAL_DEFAULT_PARAMS = {
  flickerSpeed: {
    type: 'f32' as const,
    defaultValue: 5.0,
    description: 'Speed of flickering animation',
    min: 0.0,
    max: 20.0,
    step: 0.1,
  },
  flickerIntensity: {
    type: 'f32' as const,
    defaultValue: 0.1,
    description: 'Intensity of flickering distortion',
    min: 0.0,
    max: 1.0,
    step: 0.01,
  },
  distortionStrength: {
    type: 'f32' as const,
    defaultValue: 0.1,
    description: 'Strength of UV distortion',
    min: 0.0,
    max: 1.0,
    step: 0.01,
  },
  fireOpacity: {
    type: 'f32' as const,
    defaultValue: 0.9,
    description: 'Opacity of fire effect',
    min: 0.0,
    max: 1.0,
    step: 0.01,
  },
};

/**
 * Checkerboard Shader Module Definition
 */
export interface CheckerboardShaderModule extends ShaderModule {
  id: 'checkerboard_shader';
  name: 'Checkerboard Shader';
  description: 'Checkerboard pattern shader';
  type: 'render';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: {
      ENABLE_CHECKERBOARD?: boolean;
      ALPHA_MODE_OPAQUE?: boolean;
    };
  };
  runtimeParams: {
    checkerboardSize: ShaderParamDefinition;
  };
  renderState: {
    blendMode: 'replace';
    depthTest: true;
    depthWrite: true;
    cullMode: 'back';
  };
}

/**
 * Coordinate Shader Module Definition
 */
export interface CoordinateShaderModule extends ShaderModule {
  id: 'coordinate_shader';
  name: 'Coordinate Shader';
  description: 'Coordinate system visualization shader with color-coded axes';
  type: 'render';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: Record<string, never>;
  };
  runtimeParams: Record<string, never>;
  renderState: {
    blendMode: 'replace';
    depthTest: true;
    depthWrite: true;
    cullMode: 'none';
    frontFace: 'ccw';
    sampleCount: 1;
  };
  version: string;
  author: string;
  tags: string[];
}

/**
 * Emissive Shader Module Definition
 */
export interface EmissiveShaderModule extends ShaderModule {
  id: 'emissive_shader';
  name: 'Emissive Shader';
  description: 'Emissive material with animated color cycling and pulsing effects';
  type: 'render';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: Record<string, never>;
  };
  runtimeParams: Record<string, never>;
  renderState: {
    blendMode: 'replace';
    depthTest: true;
    depthWrite: true;
    cullMode: 'back';
    frontFace: 'ccw';
    sampleCount: 1;
  };
  version: string;
  author: string;
  tags: string[];
}

/**
 * Pulsewave Shader Module Definition
 */
export interface PulsewaveShaderModule extends ShaderModule {
  id: 'pulsewave_shader';
  name: 'Pulsewave Shader';
  description: 'Animated pulsewave effect with HSV color cycling and wave distortion';
  type: 'render';
  sourceCode: string;
  includes: string[];
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: Record<string, never>;
  };
  runtimeParams: Record<string, never>;
  renderState: {
    blendMode: 'replace';
    depthTest: true;
    depthWrite: true;
    cullMode: 'back';
    frontFace: 'ccw';
    sampleCount: 1;
  };
  version: string;
  author: string;
  tags: string[];
}

/**
 * GLTF Material Shader Module Definition
 */
export interface GLTFMaterialShaderModule extends ShaderModule {
  id: 'gltf_material_shader';
  name: 'GLTF Material Shader';
  description: 'GLTF model material shader with multi-texture support and GLTF-specific features';
  type: 'render';
  compilationOptions: {
    vertexFormat: VertexFormat[];
    defines?: Record<string, never>;
  };
}
