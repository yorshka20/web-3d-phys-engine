// Fire material specific bindings
// This file defines the binding layout for fire material shaders

// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> timeData: TimeUniforms;

// Group 1: Transform uniforms (MVP)
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

// Group 2: Fire material textures
@group(2) @binding(0) var fire_texture: texture_2d<f32>;
@group(2) @binding(1) var fire_sampler: sampler;
