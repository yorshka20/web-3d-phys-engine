// PMX-specific pipeline bindings
// This file defines the binding layout for PMX material shaders

// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> timeData: TimeUniforms;

// Group 1: Transform uniforms (MVP)
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

// Group 2: PMX Material uniforms and textures
@group(2) @binding(0) var<uniform> pmxMaterial: PMXMaterialUniforms;
@group(2) @binding(1) var diffuse_texture: texture_2d<f32>;
@group(2) @binding(2) var diffuse_sampler: sampler;
@group(2) @binding(3) var normal_texture: texture_2d<f32>;
@group(2) @binding(4) var normal_sampler: sampler;
@group(2) @binding(5) var specular_texture: texture_2d<f32>;
@group(2) @binding(6) var specular_sampler: sampler;
@group(2) @binding(7) var sphere_texture: texture_2d<f32>;
@group(2) @binding(8) var sphere_sampler: sampler;
@group(2) @binding(9) var toon_texture: texture_2d<f32>;
@group(2) @binding(10) var toon_sampler: sampler;
@group(2) @binding(11) var roughness_texture: texture_2d<f32>;
@group(2) @binding(12) var roughness_sampler: sampler;
@group(2) @binding(13) var metallic_texture: texture_2d<f32>;
@group(2) @binding(14) var metallic_sampler: sampler;
@group(2) @binding(15) var emission_texture: texture_2d<f32>;
@group(2) @binding(16) var emission_sampler: sampler;