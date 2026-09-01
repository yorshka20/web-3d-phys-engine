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
// Field order must match the Float32Array layout written by MaterialBinder (128 bytes).
struct HGRPMaterialParams {
    base_color: vec4<f32>,
    rim_color: vec4<f32>,
    use_diff_ramp: f32,
    alpha_cutoff: f32, // 0.0 = alpha clip disabled
    shadow_color_brightness: f32,
    shadow_color_saturation: f32,
    use_shadow_lut: f32,
    use_bump_map: f32,
    bump_scale: f32,
    use_sdf_lightmap: f32,
    rim_intensity: f32, // pre-scaled by _SkinRimOffScale on skin in the binder
    rim_width: f32,
    use_spec_ramp: f32,
    spec_smoothness: f32,
    spec_intensity: f32,
    aniso_intensity: f32, // hair strand highlight (_AnisotropyIntensity)
    reserved1: f32,
    reserved2: f32,
    emission_color: vec4<f32>,
    use_emission: f32,
    emission_brightness: f32, // HDR-scaled (8-30 in presets); the tonemap shoulder absorbs it
    reserved3: f32,
    reserved4: f32,
}

@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;
@group(2) @binding(1) var base_map: texture_2d<f32>;
@group(2) @binding(2) var diff_ramp_map: texture_2d<f32>;
@group(2) @binding(3) var base_sampler: sampler;
@group(2) @binding(4) var ramp_sampler: sampler;
