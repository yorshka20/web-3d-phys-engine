import { HGRP_SHADER_ID_BY_VARIANT, HGRPShaderVariant } from '@renderer/material/hgrp';
import { shaderFragmentRegistry } from './registry';
import {
  CheckerboardShaderModule,
  CoordinateShaderModule,
  EmissiveShaderModule,
  FIRE_MATERIAL_DEFAULT_PARAMS,
  FireMaterialShaderModule,
  GLTFMaterialShaderModule,
  HGRPMaterialShaderModule,
  PMX_MATERIAL_DEFAULT_PARAMS,
  PMXMaterialShaderModule,
  PMXMorphComputeShaderModule,
  PulsewaveShaderModule,
  WATER_MATERIAL_DEFAULT_PARAMS,
  WaterMaterialShaderModule,
} from './types/material';
import { ShaderModule } from './types/shader';

/**
 * Create PMX Material Shader Module
 */
export function createPMXMaterialShaderModule(): PMXMaterialShaderModule {
  return {
    id: 'pmx_material_shader',
    name: 'PMX Material Shader',
    description: 'PMX model material shader with multi-texture support and PMX-specific features',
    type: 'render',
    fileName: 'PMXMaterial.wgsl',
    sourceCode: shaderFragmentRegistry.get('PMXMaterial.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/pmx_bindings.wgsl',
      'math/geometry.wgsl',
      'lighting/phong.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['pmx', 'full'],
      defines: {
        ENABLE_TOON_SHADING: false,
        ENABLE_NORMAL_MAPPING: true,
        ENABLE_ENVIRONMENT_MAPPING: true,
      },
      optimization: 'performance',
      debug: false,
    },
    runtimeParams: PMX_MATERIAL_DEFAULT_PARAMS,
    renderState: {
      blendMode: 'alpha-blend',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
      frontFace: 'cw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['pmx', 'material', 'multi-texture', 'toon-shading'],
  };
}

/**
 * Create PMX Morph Compute Shader Module
 */
export function createPMXMorphComputeShaderModule(): PMXMorphComputeShaderModule {
  return {
    id: 'pmx_morph_compute_shader',
    name: 'PMX Morph Compute Shader',
    description: 'PMX morph compute shader',
    type: 'compute',
    fileName: 'PMXMorphCompute.wgsl',
    sourceCode: shaderFragmentRegistry.get('PMXMorphCompute.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/pmx_morph_compute_bindings.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
      defines: {
        ENABLE_PMX_MORPH_COMPUTE: true,
        ENABLE_MORPH_PROCESSING: true,
      },
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'alpha-blend',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['pmx', 'morph', 'compute'],
  };
}

/**
 * Create Water Material Shader Module
 */
export function createWaterMaterialShaderModule(): WaterMaterialShaderModule {
  return {
    id: 'water_material_shader',
    name: 'Water Material Shader',
    description: 'Animated water with wave effects and fresnel reflection',
    type: 'render',
    fileName: 'WaterMaterial.wgsl',
    sourceCode: shaderFragmentRegistry.get('WaterMaterial.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/water_bindings.wgsl',
      'math/noise.wgsl',
      'lighting/phong.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
      defines: {
        ENABLE_WAVE_ANIMATION: true,
        ENABLE_FRESNEL: true,
      },
      optimization: 'performance',
      debug: false,
    },
    runtimeParams: WATER_MATERIAL_DEFAULT_PARAMS,
    renderState: {
      blendMode: 'alpha-blend',
      depthTest: true,
      depthWrite: false,
      cullMode: 'none',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['water', 'animation', 'fresnel', 'transparent'],
  };
}

/**
 * Create Fire Material Shader Module
 */
export function createFireMaterialShaderModule(): FireMaterialShaderModule {
  return {
    id: 'fire_material_shader',
    name: 'Fire Material Shader',
    description: 'Flickering fire with distortion and color gradients',
    type: 'render',
    fileName: 'FireMaterial.wgsl',
    sourceCode: shaderFragmentRegistry.get('FireMaterial.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/fire_bindings.wgsl',
      'math/color.wgsl',
      'math/noise.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
      defines: {
        ENABLE_FLICKER: true,
        ENABLE_DISTORTION: true,
      },
      optimization: 'performance',
      debug: false,
    },
    runtimeParams: FIRE_MATERIAL_DEFAULT_PARAMS,
    renderState: {
      blendMode: 'alpha-blend',
      depthTest: true,
      depthWrite: false,
      cullMode: 'none',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['fire', 'animation', 'distortion', 'transparent'],
  };
}

export function createCheckerboardShaderModule(): CheckerboardShaderModule {
  return {
    id: 'checkerboard_shader',
    name: 'Checkerboard Shader',
    description: 'Checkerboard pattern shader',
    type: 'render',
    fileName: 'Checkerboard.wgsl',
    sourceCode: shaderFragmentRegistry.get('Checkerboard.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/simple_bindings.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
      defines: {
        ENABLE_CHECKERBOARD: true,
        ALPHA_MODE_OPAQUE: true,
      },
    },
    runtimeParams: {
      checkerboardSize: {
        type: 'f32' as const,
        defaultValue: 1.0,
        description: 'Size of checkerboard pattern',
        min: 0.0,
        max: 1.0,
        step: 0.01,
      },
    },
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['checkerboard', 'pattern', 'transparent'],
  };
}

/**
 * Create Coordinate Shader Module
 */
export function createCoordinateShaderModule(): CoordinateShaderModule {
  return {
    id: 'coordinate_shader',
    name: 'Coordinate Shader',
    description: 'Coordinate system visualization shader with color-coded axes',
    type: 'render',
    fileName: 'Coordinate.wgsl',
    sourceCode: shaderFragmentRegistry.get('Coordinate.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/simple_bindings.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['colored'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'none',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['coordinate', 'axes', 'debug', 'visualization'],
  };
}

/**
 * Create Emissive Shader Module
 */
export function createEmissiveShaderModule(): EmissiveShaderModule {
  return {
    id: 'emissive_shader',
    name: 'Emissive Shader',
    description: 'Emissive material with animated color cycling and pulsing effects',
    type: 'render',
    fileName: 'Emissive.wgsl',
    sourceCode: shaderFragmentRegistry.get('Emissive.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/simple_bindings.wgsl',
      'math/color.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['emissive', 'animation', 'pulsing', 'color-cycle'],
  };
}

/**
 * Create Pulsewave Shader Module
 */
export function createPulsewaveShaderModule(): PulsewaveShaderModule {
  return {
    id: 'pulsewave_shader',
    name: 'Pulsewave Shader',
    description: 'Animated pulsewave effect with HSV color cycling and wave distortion',
    type: 'render',
    fileName: 'Pulsewave.wgsl',
    sourceCode: shaderFragmentRegistry.get('Pulsewave.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/vertex_types.wgsl',
      'bindings/simple_bindings.wgsl',
      'math/color.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['pulsewave', 'animation', 'hsv', 'wave-distortion'],
  };
}

export function createDefaultShaderModule(): ShaderModule {
  return {
    id: 'default_shader',
    name: 'Default Shader',
    description: 'Default shader for fallback',
    type: 'render',
    fileName: 'Default.wgsl',
    sourceCode: shaderFragmentRegistry.get('Default.wgsl') || '',
    includes: ['core/constants.wgsl'],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['default', 'fallback'],
  };
}

// One module per CharacterNPR variant: shared vertex stage and shading core come from
// includes; the per-variant file is where variant features (SDF / matcap / hair aniso / spec
// ramp) land.
export function createHGRPMaterialShaderModules(): HGRPMaterialShaderModule[] {
  const variants: { variant: HGRPShaderVariant; fileName: string; description: string }[] = [
    {
      variant: 'CharacterNPR',
      fileName: 'HGRPNpr.wgsl',
      description: 'HGRP CharacterNPR material shader (cloth / general)',
    },
    {
      variant: 'CharacterNPR_Skin',
      fileName: 'HGRPSkin.wgsl',
      description: 'HGRP CharacterNPR_Skin material shader (face + body)',
    },
    {
      variant: 'CharacterNPR_Hair',
      fileName: 'HGRPHair.wgsl',
      description: 'HGRP CharacterNPR_Hair material shader',
    },
    {
      variant: 'CharacterNPR_Eye',
      fileName: 'HGRPEye.wgsl',
      description: 'HGRP CharacterNPR_Eye material shader (brow + iris)',
    },
  ];

  return variants.map(({ variant, fileName, description }) => ({
    id: HGRP_SHADER_ID_BY_VARIANT[variant],
    name: `HGRP ${variant} Shader`,
    description,
    type: 'render' as const,
    fileName,
    sourceCode: shaderFragmentRegistry.get(fileName) || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/gltf_types.wgsl',
      'core/hgrp_types.wgsl',
      'core/gltf_skinning.wgsl',
      'math/color.wgsl',
      'bindings/hgrp_bindings.wgsl',
      'core/hgrp_vertex.wgsl',
      'lighting/hgrp_shadow_lut.wgsl',
      'lighting/hgrp_npr.wgsl',
      ...(variant === 'CharacterNPR_Eye' ? ['lighting/hgrp_eye_shading.wgsl'] : []),
    ],
    compilationOptions: {
      vertexFormat: ['full' as const],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace' as const,
      depthTest: true,
      depthWrite: true,
      cullMode: 'back' as const,
      frontFace: 'ccw' as const,
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['hgrp', 'npr', 'character', variant],
  }));
}

// The eye overlay shader draws the iris with a depth-biased projection (pass-private
// pipeline in HGRPEyeOverlayStage); it shares the Eye variant's fragment shading but brings
// its own vertex stage, so core/hgrp_vertex.wgsl is NOT included.
export function createHGRPEyeOverlayShaderModule(): ShaderModule {
  return {
    id: 'hgrp_eye_overlay_shader',
    name: 'HGRP Eye Overlay Shader',
    description: 'HGRP iris overlay (Eye shading with camera-biased depth)',
    type: 'render',
    fileName: 'passes/hgrp_eye_overlay.wgsl',
    sourceCode: shaderFragmentRegistry.get('passes/hgrp_eye_overlay.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/gltf_types.wgsl',
      'core/hgrp_types.wgsl',
      'core/gltf_skinning.wgsl',
      'math/color.wgsl',
      'bindings/hgrp_bindings.wgsl',
      'lighting/hgrp_shadow_lut.wgsl',
      'lighting/hgrp_npr.wgsl',
      'lighting/hgrp_eye_shading.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: false,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['hgrp', 'eye', 'npr'],
  };
}

// The outline shader is shared by every HGRP variant (its pipeline is pass-private —
// front-face culling is not expressible in the semantic pipeline key).
export function createHGRPOutlineShaderModule(): ShaderModule {
  return {
    id: 'hgrp_outline_shader',
    name: 'HGRP Outline Shader',
    description: 'HGRP inverted-hull outline (extruded along normals, HSV-adjusted base color)',
    type: 'render',
    fileName: 'passes/hgrp_outline.wgsl',
    sourceCode: shaderFragmentRegistry.get('passes/hgrp_outline.wgsl') || '',
    includes: [
      'core/uniforms.wgsl',
      'core/gltf_types.wgsl',
      'core/hgrp_types.wgsl',
      'core/gltf_skinning.wgsl',
      'math/color.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'front',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['hgrp', 'outline', 'npr'],
  };
}

// Brow-through compositing pair: the hair stencil mark and the occluded-brow overlay
// (pipelines are pass-private — stencil states are not expressible in the semantic key).
export function createHGRPHairStencilShaderModule(): ShaderModule {
  return {
    id: 'hgrp_hair_stencil_shader',
    name: 'HGRP Hair Stencil Shader',
    description: 'HGRP hair stencil mark (sw_M-masked, brow-through compositing)',
    type: 'render',
    fileName: 'passes/hgrp_hair_stencil.wgsl',
    sourceCode: shaderFragmentRegistry.get('passes/hgrp_hair_stencil.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/gltf_types.wgsl',
      'core/hgrp_types.wgsl',
      'core/gltf_skinning.wgsl',
      'bindings/hgrp_bindings.wgsl',
      'core/hgrp_vertex.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: false,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['hgrp', 'hair', 'stencil', 'npr'],
  };
}

export function createHGRPBrowThroughShaderModule(): ShaderModule {
  return {
    id: 'hgrp_brow_through_shader',
    name: 'HGRP Brow Through Shader',
    description: 'HGRP occluded-brow overlay (stencil-gated through the hair mark)',
    type: 'render',
    fileName: 'passes/hgrp_brow_through.wgsl',
    sourceCode: shaderFragmentRegistry.get('passes/hgrp_brow_through.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/gltf_types.wgsl',
      'core/hgrp_types.wgsl',
      'core/gltf_skinning.wgsl',
      'math/color.wgsl',
      'bindings/hgrp_bindings.wgsl',
      'core/hgrp_vertex.wgsl',
      'lighting/hgrp_shadow_lut.wgsl',
      'lighting/hgrp_npr.wgsl',
      'lighting/hgrp_eye_shading.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'alpha-blend',
      depthTest: true,
      depthWrite: false,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['hgrp', 'brow', 'stencil', 'npr'],
  };
}

export function createGLTFMaterialShaderModule(): GLTFMaterialShaderModule {
  return {
    id: 'gltf_material_shader',
    name: 'GLTF Material Shader',
    description: 'GLTF model material shader with multi-texture support and GLTF-specific features',
    type: 'render',
    fileName: 'Gltf.wgsl',
    sourceCode: shaderFragmentRegistry.get('Gltf.wgsl') || '',
    includes: [
      'core/constants.wgsl',
      'core/uniforms.wgsl',
      'core/gltf_types.wgsl',
      'bindings/gltf_bindings.wgsl',
    ],
    compilationOptions: {
      vertexFormat: ['full'],
    },
    runtimeParams: {},
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
      frontFace: 'ccw',
      sampleCount: 1,
    },
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['gltf', 'material', 'multi-texture'],
  };
}
