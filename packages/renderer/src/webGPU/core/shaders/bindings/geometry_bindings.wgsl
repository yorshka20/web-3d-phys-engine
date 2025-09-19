// Standard geometry pipeline bindings
// Group 0: Time uniforms
@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

// Group 1: MVP uniforms  
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

// Group 2: Material and textures
@group(2) @binding(0) var<uniform> material: MaterialUniforms;
@group(2) @binding(1) var diffuse_texture: texture_2d<f32>;
@group(2) @binding(2) var diffuse_sampler: sampler;
@group(2) @binding(3) var normal_texture: texture_2d<f32>;
@group(2) @binding(4) var normal_sampler: sampler;
@group(2) @binding(5) var specular_texture: texture_2d<f32>;
@group(2) @binding(6) var specular_sampler: sampler;
@group(2) @binding(7) var emissive_texture: texture_2d<f32>;
@group(2) @binding(8) var emissive_sampler: sampler;
