// Water material specific bindings
// This file defines the binding layout for water material shaders

// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

// Group 1: Transform uniforms (MVP)
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

// Group 2: Water material textures
@group(2) @binding(0) var water_texture: texture_2d<f32>;
@group(2) @binding(1) var water_sampler: sampler;

// Group 3: Water material uniforms
@group(3) @binding(0) var<uniform> material: MaterialUniforms;
