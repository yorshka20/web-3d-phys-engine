// Material shaders
import checkerboardShader from './materials/Checkerboard.wgsl';
import coordinateShader from './materials/Coordinate.wgsl';
import defaultShader from './materials/Default.wgsl';
import emissiveShader from './materials/Emissive.wgsl';
import fireMaterialShader from './materials/FireMaterial.wgsl';
import pmxMaterialShader from './materials/PMXMaterial.wgsl';
import pulsewaveShader from './materials/Pulsewave.wgsl';
import waterMaterialShader from './materials/WaterMaterial.wgsl';

// Compute shaders
import pmxMorphComputeShader from './materials/PMXMorphCompute.wgsl';

// Core fragments
import constantsFragment from './core/constants.wgsl';
import uniformsFragment from './core/uniforms.wgsl';
import vertexTypesFragment from './core/vertex_types.wgsl';

// Math fragments
import colorFragment from './math/color.wgsl';
import geometryFragment from './math/geometry.wgsl';
import noiseFragment from './math/noise.wgsl';
import vectorFragment from './math/vector.wgsl';

// Lighting fragments
import pbrFragment from './lighting/pbr.wgsl';
import phongFragment from './lighting/phong.wgsl';
import toonFragment from './lighting/toon.wgsl';

// Pass fragments
import deferredFragment from './passes/deferred.wgsl';
import forwardFragment from './passes/forward.wgsl';
import shadowFragment from './passes/shadow.wgsl';

// Binding fragments
import fireBindingsFragment from './bindings/fire_bindings.wgsl';
import pmxBindingsFragment from './bindings/pmx_bindings.wgsl';
import pmxMorphComputeBindingsFragment from './bindings/pmx_morph_compute_bindings.wgsl';
import simpleBindingsFragment from './bindings/simple_bindings.wgsl';
import waterBindingsFragment from './bindings/water_bindings.wgsl';

// Shader fragment registry - maps file paths to actual fragment content
export const shaderFragmentRegistry = new Map([
  // Core fragments
  ['core/uniforms.wgsl', uniformsFragment],
  ['core/vertex_types.wgsl', vertexTypesFragment],
  ['core/constants.wgsl', constantsFragment],

  // Math fragments
  ['math/color.wgsl', colorFragment],
  ['math/geometry.wgsl', geometryFragment],
  ['math/vector.wgsl', vectorFragment],
  ['math/noise.wgsl', noiseFragment],

  // Lighting fragments
  ['lighting/phong.wgsl', phongFragment],
  ['lighting/pbr.wgsl', pbrFragment],
  ['lighting/toon.wgsl', toonFragment],

  // Pass fragments
  ['passes/forward.wgsl', forwardFragment],
  ['passes/deferred.wgsl', deferredFragment],
  ['passes/shadow.wgsl', shadowFragment],

  // Binding fragments
  ['bindings/pmx_bindings.wgsl', pmxBindingsFragment],
  ['bindings/water_bindings.wgsl', waterBindingsFragment],
  ['bindings/fire_bindings.wgsl', fireBindingsFragment],
  ['bindings/simple_bindings.wgsl', simpleBindingsFragment],
  ['bindings/pmx_morph_compute_bindings.wgsl', pmxMorphComputeBindingsFragment],

  // Material shaders
  ['PMXMaterial.wgsl', pmxMaterialShader],
  ['WaterMaterial.wgsl', waterMaterialShader],
  ['FireMaterial.wgsl', fireMaterialShader],
  ['Coordinate.wgsl', coordinateShader],
  ['Checkerboard.wgsl', checkerboardShader],
  ['Emissive.wgsl', emissiveShader],
  ['Pulsewave.wgsl', pulsewaveShader],

  // Compute shaders
  ['PMXMorphCompute.wgsl', pmxMorphComputeShader],

  // Default shader for fallback
  ['Default.wgsl', defaultShader],
]);
