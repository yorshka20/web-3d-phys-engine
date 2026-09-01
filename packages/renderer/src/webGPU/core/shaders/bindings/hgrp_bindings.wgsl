// Common bindings shared by every HGRP variant shader. Variant-specific texture bindings
// (binding 5 and up, wired in HGRPMaterialResources.ts slot tables) are declared inside the
// variant material shaders as their features consume them — a pipeline layout may carry more
// entries than the shader declares.

// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

// Group 1: Transform uniforms (MVP)
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

// Group 2: HGRP material params + textures.
// Samplers are shared across textures (not one per texture): default WebGPU limits allow
// 16 sampled textures AND 16 samplers per stage, and the skin variant alone carries
// 9 textures.
struct HGRPMaterialParams {
    base_color: vec4<f32>,
    use_diff_ramp: f32,
    alpha_cutoff: f32, // 0.0 = alpha clip disabled
    reserved0: f32,
    reserved1: f32,
}

@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;
@group(2) @binding(1) var base_map: texture_2d<f32>;
@group(2) @binding(2) var diff_ramp_map: texture_2d<f32>;
@group(2) @binding(3) var base_sampler: sampler;
@group(2) @binding(4) var ramp_sampler: sampler;
