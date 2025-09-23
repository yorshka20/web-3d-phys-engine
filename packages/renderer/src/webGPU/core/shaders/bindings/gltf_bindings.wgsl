// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

// Group 1: Transform uniforms (MVP)
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;
@group(1) @binding(1) var<uniform> joints: JointMatrices;

// Group 2: PBR Material uniforms and textures
@group(2) @binding(0) var<uniform> material: PBRMaterial;
@group(2) @binding(1) var base_color_texture: texture_2d<f32>;
@group(2) @binding(2) var base_color_sampler: sampler;
@group(2) @binding(3) var metallic_roughness_texture: texture_2d<f32>;
@group(2) @binding(4) var metallic_roughness_sampler: sampler;
@group(2) @binding(5) var normal_texture: texture_2d<f32>;
@group(2) @binding(6) var normal_sampler: sampler;
@group(2) @binding(7) var occlusion_texture: texture_2d<f32>;
@group(2) @binding(8) var occlusion_sampler: sampler;
@group(2) @binding(9) var emissive_texture: texture_2d<f32>;
@group(2) @binding(10) var emissive_sampler: sampler;