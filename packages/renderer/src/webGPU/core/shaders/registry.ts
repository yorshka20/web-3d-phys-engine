// Material shaders
import checkerboardShader from './materials/Checkerboard.wgsl';
import coordinateShader from './materials/Coordinate.wgsl';
import defaultShader from './materials/Default.wgsl';
import emissiveShader from './materials/Emissive.wgsl';
import fireMaterialShader from './materials/FireMaterial.wgsl';
import pmxMaterialShader from './materials/PMXMaterial.wgsl';
import pulsewaveShader from './materials/Pulsewave.wgsl';
import waterMaterialShader from './materials/WaterMaterial.wgsl';

// GLTF material shaders
import gltfMaterialShader from './materials/Gltf.wgsl';

// HGRP material shaders (one per CharacterNPR variant)
import hgrpNprShader from './materials/HGRPNpr.wgsl';
import hgrpSkinShader from './materials/HGRPSkin.wgsl';
import hgrpHairShader from './materials/HGRPHair.wgsl';
import hgrpEyeShader from './materials/HGRPEye.wgsl';
import hgrpVfxShader from './materials/HGRPVfx.wgsl';

// Compute shaders
import pmxMorphComputeShader from './compute/PMXMorphCompute.wgsl';

// Core fragments
import constantsFragment from './core/constants.wgsl';
import gltfSkinningFragment from './core/gltf_skinning.wgsl';
import gltfTypesFragment from './core/gltf_types.wgsl';
import hgrpVertexFragment from './core/hgrp_vertex.wgsl';
import uniformsFragment from './core/uniforms.wgsl';
import vertexTypesFragment from './core/vertex_types.wgsl';

// Math fragments
import colorFragment from './math/color.wgsl';
import geometryFragment from './math/geometry.wgsl';
import noiseFragment from './math/noise.wgsl';
import vectorFragment from './math/vector.wgsl';

// Lighting fragments
import hgrpEyeShadingFragment from './lighting/hgrp_eye_shading.wgsl';
import hgrpNprFragment from './lighting/hgrp_npr.wgsl';
import hgrpShadowLutFragment from './lighting/hgrp_shadow_lut.wgsl';
import pbrFragment from './lighting/pbr.wgsl';
import phongFragment from './lighting/phong.wgsl';
import toonFragment from './lighting/toon.wgsl';

// Pass fragments
import deferredFragment from './passes/deferred.wgsl';
import forwardFragment from './passes/forward.wgsl';
import hgrpBrowThroughShader from './passes/hgrp_brow_through.wgsl';
import hgrpEyeOverlayShader from './passes/hgrp_eye_overlay.wgsl';
import hgrpHairStencilShader from './passes/hgrp_hair_stencil.wgsl';
import hgrpOutlineShader from './passes/hgrp_outline.wgsl';
import shadowFragment from './passes/shadow.wgsl';

// Binding fragments
import fireBindingsFragment from './bindings/fire_bindings.wgsl';
import gltfBindingsFragment from './bindings/gltf_bindings.wgsl';
import hgrpBindingsFragment from './bindings/hgrp_bindings.wgsl';
import pmxBindingsFragment from './bindings/pmx_bindings.wgsl';
import pmxMorphComputeBindingsFragment from './bindings/pmx_morph_compute_bindings.wgsl';
import simpleBindingsFragment from './bindings/simple_bindings.wgsl';
import waterBindingsFragment from './bindings/water_bindings.wgsl';

// Generated fragments (uniform structs + per-variant group-2 bindings of the HGRP contract)
import { hgrpGeneratedShaderFragments } from '../HGRPMaterialLayout';

// Shader fragment registry - maps file paths to actual fragment content. Static .wgsl files
// are inlined by the Vite wgsl-loader; the HGRP material contract contributes generated
// fragments (uniform structs + per-variant group-2 bindings) under generated/.
export const shaderFragmentRegistry = new Map<string, string>([
  // Core fragments
  ['core/uniforms.wgsl', uniformsFragment],
  ['core/vertex_types.wgsl', vertexTypesFragment],
  ['core/constants.wgsl', constantsFragment],
  ['core/gltf_types.wgsl', gltfTypesFragment],
  ['core/gltf_skinning.wgsl', gltfSkinningFragment],
  ['core/hgrp_vertex.wgsl', hgrpVertexFragment],

  // Math fragments
  ['math/color.wgsl', colorFragment],
  ['math/geometry.wgsl', geometryFragment],
  ['math/vector.wgsl', vectorFragment],
  ['math/noise.wgsl', noiseFragment],

  // Lighting fragments
  ['lighting/phong.wgsl', phongFragment],
  ['lighting/pbr.wgsl', pbrFragment],
  ['lighting/toon.wgsl', toonFragment],
  ['lighting/hgrp_npr.wgsl', hgrpNprFragment],
  ['lighting/hgrp_shadow_lut.wgsl', hgrpShadowLutFragment],
  ['lighting/hgrp_eye_shading.wgsl', hgrpEyeShadingFragment],

  // Pass fragments
  ['passes/forward.wgsl', forwardFragment],
  ['passes/deferred.wgsl', deferredFragment],
  ['passes/shadow.wgsl', shadowFragment],
  ['passes/hgrp_outline.wgsl', hgrpOutlineShader],
  ['passes/hgrp_eye_overlay.wgsl', hgrpEyeOverlayShader],
  ['passes/hgrp_hair_stencil.wgsl', hgrpHairStencilShader],
  ['passes/hgrp_brow_through.wgsl', hgrpBrowThroughShader],

  // Binding fragments
  ['bindings/pmx_bindings.wgsl', pmxBindingsFragment],
  ['bindings/water_bindings.wgsl', waterBindingsFragment],
  ['bindings/fire_bindings.wgsl', fireBindingsFragment],
  ['bindings/simple_bindings.wgsl', simpleBindingsFragment],
  ['bindings/pmx_morph_compute_bindings.wgsl', pmxMorphComputeBindingsFragment],
  ['bindings/gltf_bindings.wgsl', gltfBindingsFragment],
  ['bindings/hgrp_bindings.wgsl', hgrpBindingsFragment],

  // Material shaders
  ['PMXMaterial.wgsl', pmxMaterialShader],
  ['WaterMaterial.wgsl', waterMaterialShader],
  ['FireMaterial.wgsl', fireMaterialShader],
  ['Coordinate.wgsl', coordinateShader],
  ['Checkerboard.wgsl', checkerboardShader],
  ['Emissive.wgsl', emissiveShader],
  ['Pulsewave.wgsl', pulsewaveShader],
  ['Gltf.wgsl', gltfMaterialShader],
  ['HGRPNpr.wgsl', hgrpNprShader],
  ['HGRPSkin.wgsl', hgrpSkinShader],
  ['HGRPHair.wgsl', hgrpHairShader],
  ['HGRPEye.wgsl', hgrpEyeShader],
  ['HGRPVfx.wgsl', hgrpVfxShader],

  // Compute shaders
  ['PMXMorphCompute.wgsl', pmxMorphComputeShader],

  // Default shader for fallback
  ['Default.wgsl', defaultShader],

  ...hgrpGeneratedShaderFragments(),
]);
