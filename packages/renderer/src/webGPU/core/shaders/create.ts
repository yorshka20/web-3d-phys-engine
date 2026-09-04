import {
  HGRP_MATERIAL_PARAMS_LAYOUT,
  hgrpDebugViewFragment,
  hgrpGroup2BindingsFragment,
  hgrpParamsLayoutForVariant,
  hgrpPermutation,
  hgrpPermutationForShaderId,
  HGRPPermutation,
  HGRPPermutationShaderId,
  hgrpPermutationSuffix,
  HGRPShaderVariant,
  hgrpSplitShaderId,
  hgrpSubsystemIncludes,
  HGRPSubsystemId,
  hgrpVariantForShaderId,
  isHGRPShaderId,
} from '../../../material/hgrp';
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
    fileName: 'materials/PMXMaterial.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/PMXMaterial.wgsl') || '',
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
        // No environment-map bind group exists yet (PipelineManager only reserves one)
        ENABLE_ENVIRONMENT_MAPPING: false,
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
    fileName: 'compute/PMXMorphCompute.wgsl',
    sourceCode: shaderFragmentRegistry.get('compute/PMXMorphCompute.wgsl') || '',
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
    fileName: 'materials/WaterMaterial.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/WaterMaterial.wgsl') || '',
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
    fileName: 'materials/FireMaterial.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/FireMaterial.wgsl') || '',
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
    fileName: 'materials/Checkerboard.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/Checkerboard.wgsl') || '',
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
      cellSize: {
        type: 'f32' as const,
        defaultValue: 1.0,
        description: 'Checker cell size, in world units',
        min: 0.05,
        max: 50.0,
        step: 0.05,
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
    fileName: 'materials/Coordinate.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/Coordinate.wgsl') || '',
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
    fileName: 'materials/Emissive.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/Emissive.wgsl') || '',
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
    fileName: 'materials/Pulsewave.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/Pulsewave.wgsl') || '',
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
    fileName: 'materials/Default.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/Default.wgsl') || '',
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

// ---------------------------------------------------------------------------------------
// HGRP: modules derived from a permutation id
// ---------------------------------------------------------------------------------------
//
// An HGRP material's customShaderId names its permutation (material/hgrp/permutation.ts):
// `hgrp_skin_shader+ramp+shadowLut+normal`. The pass shaders that shade a material through
// its own group-2 bind group (eye overlay, brow-through, hair stencil) carry the same suffix.
// None of these modules is listed in the catalog — createDerivedShaderModule builds one when
// ShaderManager first meets its id, so exactly the permutations the scene uses get compiled.
// The includes select, per static subsystem, its hook fragment or its generated off-stub, and
// the generated group-2 fragment declares only the enabled subsystems' textures.

const HGRP_VARIANT_MAIN: Record<HGRPShaderVariant, { fileName: string; description: string }> = {
  CharacterNPR: {
    fileName: 'materials/HGRPNpr.wgsl',
    description: 'HGRP CharacterNPR material shader (cloth / general)',
  },
  CharacterNPR_Skin: {
    fileName: 'materials/HGRPSkin.wgsl',
    description: 'HGRP CharacterNPR_Skin material shader (face + body)',
  },
  CharacterNPR_Hair: {
    fileName: 'materials/HGRPHair.wgsl',
    description: 'HGRP CharacterNPR_Hair material shader',
  },
  CharacterNPR_Eye: {
    fileName: 'materials/HGRPEye.wgsl',
    description: 'HGRP CharacterNPR_Eye material shader (brow + iris)',
  },
  CharacterNPR_VFX: {
    fileName: 'materials/HGRPVfx.wgsl',
    description: 'HGRP CharacterNPR_VFX material shader (character effect layers)',
  },
};

// Pass shaders built on a material permutation. `vertex`: include the shared vertex stage
// (the eye overlay brings its own depth-biased one). `shading`: include the NPR core and the
// subsystem hooks.
export const HGRP_PASS_SHADERS = {
  eyeOverlay: {
    id: 'hgrp_eye_overlay_shader',
    variant: 'CharacterNPR_Eye',
    fileName: 'passes/hgrp_eye_overlay.wgsl',
    name: 'HGRP Eye Overlay Shader',
    description: 'HGRP iris overlay (Eye shading with camera-biased depth)',
    vertex: false,
    shading: true,
    tags: ['hgrp', 'eye', 'npr'],
  },
  hairUnderBrow: {
    id: 'hgrp_hair_under_brow_shader',
    variant: 'CharacterNPR_Hair',
    fileName: 'passes/hgrp_hair_under_brow.wgsl',
    name: 'HGRP Hair Under Brow Shader',
    description: 'HGRP hair strands inside the brow cut-out (hair shading, stencil yield)',
    vertex: true,
    shading: true,
    tags: ['hgrp', 'hair', 'brow', 'npr'],
  },
} as const satisfies Record<
  string,
  {
    id: string;
    variant: HGRPShaderVariant;
    fileName: string;
    name: string;
    description: string;
    vertex: boolean;
    shading: boolean;
    tags: readonly string[];
  }
>;

export type HGRPPassShader = keyof typeof HGRP_PASS_SHADERS;

// Shader id of a pass shader specialized for one material's permutation.
export function hgrpPassShaderId(pass: HGRPPassShader, permutation: HGRPPermutation): string {
  const spec = HGRP_PASS_SHADERS[pass];
  if (permutation.variant !== spec.variant) {
    throw new Error(
      `HGRP ${pass} pass shades ${spec.variant} materials, got ${permutation.variant}`,
    );
  }
  return spec.id + hgrpPermutationSuffix(permutation.enabled);
}

// The CharacterNPR family shares one shading core; the VFX variant shares only the vertex
// stage, bringing its own uniform block and bindings (no ramp, no rim, no _BaseMap).
function hgrpNprFamilyIncludes(
  permutation: HGRPPermutation,
  options: { vertex: boolean; shading: boolean },
): string[] {
  return [
    'core/constants.wgsl',
    'core/uniforms.wgsl',
    'core/gltf_types.wgsl',
    hgrpParamsLayoutForVariant(permutation.variant).fragmentPath,
    'core/gltf_skinning.wgsl',
    'core/hgrp_transform.wgsl',
    'math/color.wgsl',
    'bindings/hgrp_bindings.wgsl',
    hgrpGroup2BindingsFragment(permutation),
    ...(options.vertex ? ['core/hgrp_vertex.wgsl'] : []),
    ...(options.shading
      ? [
          ...hgrpSubsystemIncludes(permutation),
          'lighting/hgrp_lighting.wgsl',
          'lighting/hgrp_npr.wgsl',
          ...(permutation.variant === 'CharacterNPR_Eye' ? ['lighting/hgrp_eye_shading.wgsl'] : []),
          ...(permutation.variant === 'CharacterNPR_Hair'
            ? ['lighting/hgrp_hair_shading.wgsl']
            : []),
          ...(permutation.variant === 'CharacterNPR' ? ['lighting/hgrp_silk_stockings.wgsl'] : []),
          'core/hgrp_debug.wgsl',
          hgrpDebugViewFragment(permutation),
        ]
      : []),
  ];
}

function hgrpVfxIncludes(permutation: HGRPPermutation): string[] {
  return [
    'core/constants.wgsl',
    'core/uniforms.wgsl',
    'core/gltf_types.wgsl',
    hgrpParamsLayoutForVariant(permutation.variant).fragmentPath,
    'core/gltf_skinning.wgsl',
    'bindings/hgrp_bindings.wgsl',
    hgrpGroup2BindingsFragment(permutation),
    'core/hgrp_vertex.wgsl',
    'core/hgrp_debug.wgsl',
    hgrpDebugViewFragment(permutation),
  ];
}

const HGRP_RENDER_STATE = {
  blendMode: 'replace',
  depthTest: true,
  depthWrite: true,
  cullMode: 'back',
  frontFace: 'ccw',
  sampleCount: 1,
} as const;

function createHGRPMaterialShaderModule(shaderId: string): HGRPMaterialShaderModule {
  const permutation = hgrpPermutationForShaderId(shaderId);
  const main = HGRP_VARIANT_MAIN[permutation.variant];
  return {
    id: shaderId as HGRPPermutationShaderId,
    name: `HGRP ${permutation.variant} Shader`,
    description: main.description,
    type: 'render',
    fileName: main.fileName,
    sourceCode: shaderFragmentRegistry.get(main.fileName) || '',
    includes:
      permutation.variant === 'CharacterNPR_VFX'
        ? hgrpVfxIncludes(permutation)
        : hgrpNprFamilyIncludes(permutation, { vertex: true, shading: true }),
    compilationOptions: { vertexFormat: ['full'] },
    runtimeParams: {},
    renderState: HGRP_RENDER_STATE,
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: ['hgrp', 'npr', 'character', permutation.variant, ...permutation.enabled],
  };
}

function createHGRPPassShaderModule(
  pass: HGRPPassShader,
  enabled: readonly HGRPSubsystemId[],
): ShaderModule {
  const spec = HGRP_PASS_SHADERS[pass];
  const permutation = hgrpPermutation(spec.variant, enabled);
  return {
    id: hgrpPassShaderId(pass, permutation),
    name: spec.name,
    description: spec.description,
    type: 'render',
    fileName: spec.fileName,
    sourceCode: shaderFragmentRegistry.get(spec.fileName) || '',
    includes: hgrpNprFamilyIncludes(permutation, { vertex: spec.vertex, shading: spec.shading }),
    compilationOptions: { vertexFormat: ['full'] },
    runtimeParams: {},
    // The pass stages own their pipelines and render state; this block is descriptive only.
    renderState: HGRP_RENDER_STATE,
    version: '1.0.0',
    author: 'WebGPU 3D Physics Engine',
    tags: [...spec.tags, ...enabled],
  };
}

// The outline shader is shared by every HGRP variant and permutation (its pipeline is
// pass-private — front-face culling is not expressible in the semantic pipeline key — and its
// private group 2 reads the shared uniform block, so no subsystem shapes it).
export function createHGRPOutlineShaderModule(): ShaderModule {
  return {
    id: 'hgrp_outline_shader',
    name: 'HGRP Outline Shader',
    description: 'HGRP inverted-hull outline (world-constant width, lit base color)',
    type: 'render',
    fileName: 'passes/hgrp_outline.wgsl',
    sourceCode: shaderFragmentRegistry.get('passes/hgrp_outline.wgsl') || '',
    includes: [
      'core/uniforms.wgsl',
      'core/gltf_types.wgsl',
      HGRP_MATERIAL_PARAMS_LAYOUT.fragmentPath,
      'core/gltf_skinning.wgsl',
      'core/hgrp_transform.wgsl',
      'math/color.wgsl',
      'lighting/hgrp_lighting.wgsl',
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

// A module for an id the catalog does not list, or undefined if no family derives it. HGRP ids
// carry their permutation; a malformed HGRP id throws (a typo must not become a silent miss).
export function createDerivedShaderModule(id: string): ShaderModule | undefined {
  if (!isHGRPShaderId(id)) {
    return undefined;
  }
  const { base, enabled } = hgrpSplitShaderId(id);
  if (hgrpVariantForShaderId(base)) {
    return createHGRPMaterialShaderModule(id);
  }
  const pass = (Object.keys(HGRP_PASS_SHADERS) as HGRPPassShader[]).find(
    (key) => HGRP_PASS_SHADERS[key].id === base,
  );
  return pass ? createHGRPPassShaderModule(pass, enabled) : undefined;
}

export function createGLTFMaterialShaderModule(): GLTFMaterialShaderModule {
  return {
    id: 'gltf_material_shader',
    name: 'GLTF Material Shader',
    description: 'GLTF model material shader with multi-texture support and GLTF-specific features',
    type: 'render',
    fileName: 'materials/Gltf.wgsl',
    sourceCode: shaderFragmentRegistry.get('materials/Gltf.wgsl') || '',
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

// Every fixed shader module the renderer knows about. Registering is this list; compilation
// happens on first use (ShaderManager.ensureCompiled), so a module nothing draws is never
// compiled. Adding a shader = one .wgsl file under shaders/ (auto-registered by the fragment
// registry glob) + one factory entry here. HGRP material and pass shaders are not listed: they
// are derived per permutation (createDerivedShaderModule).
export function createShaderModules(): ShaderModule[] {
  return [
    createDefaultShaderModule(),
    createCheckerboardShaderModule(),
    createCoordinateShaderModule(),
    createEmissiveShaderModule(),
    createPulsewaveShaderModule(),
    createPMXMaterialShaderModule(),
    createPMXMorphComputeShaderModule(),
    createWaterMaterialShaderModule(),
    createFireMaterialShaderModule(),
    createGLTFMaterialShaderModule(),
    createHGRPOutlineShaderModule(),
  ];
}
