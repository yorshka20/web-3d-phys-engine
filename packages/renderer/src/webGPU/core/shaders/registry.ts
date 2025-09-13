// Material shaders
import checkerboardShader from './materials/Checkerboard.wgsl';
import coordinateShader from './materials/Coordinate.wgsl';
import emissiveShader from './materials/Emissive.wgsl';
import fireMaterialShader from './materials/FireMaterial.wgsl';
import pmxMaterialShader from './materials/PMXMaterial.wgsl';
import pulsewaveShader from './materials/Pulsewave.wgsl';
import waterMaterialShader from './materials/WaterMaterial.wgsl';

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
import simpleBindingsFragment from './bindings/simple_bindings.wgsl';
import waterBindingsFragment from './bindings/water_bindings.wgsl';

const defaultShader = `
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
    cameraPos: vec3<f32>,
    padding: f32,
}

struct TimeUniforms {
    time: f32,
    deltaTime: f32,
    frameCount: u32,
    padding: u32,
}

@group(0) @binding(0) var<uniform> timeData: TimeUniforms;
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
    out.uv = input.uv;
    return out;
}

@fragment
fn fs_main(input: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    // Fixed: Use UV coordinates as color instead of non-existent input.color
    output.color = vec4<f32>(input.uv, 0.0, 1.0);
 
    return output;
}
`;

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

  // Material shaders
  ['PMXMaterial.wgsl', pmxMaterialShader],
  ['WaterMaterial.wgsl', waterMaterialShader],
  ['FireMaterial.wgsl', fireMaterialShader],
  ['Coordinate.wgsl', coordinateShader],
  ['Checkerboard.wgsl', checkerboardShader],
  ['Emissive.wgsl', emissiveShader],
  ['Pulsewave.wgsl', pulsewaveShader],

  // Default shader for fallback
  ['default.wgsl', defaultShader],
]);
