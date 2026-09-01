// HGRP material uniform block, shared by the variant shaders (bindings/hgrp_bindings.wgsl)
// and the outline shader (passes/hgrp_outline.wgsl).
// Field order must match the Float32Array layout written by MaterialBinder (192 bytes).
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
    use_matcap: f32, // eye glint layer (_UseMatcap)
    matcap_normal_scale: f32, // _MatcapNormalScale
    emission_color: vec4<f32>,
    use_emission: f32,
    emission_brightness: f32, // HDR-scaled (8-30 in presets); the tonemap shoulder absorbs it
    outline_width: f32,
    outline_color_brightness: f32,
    outline_color_saturation: f32,
    eye_highlight: f32, // _EyeHighLight — the iris base alpha is the highlight mask
    reserved1: f32,
    reserved2: f32,
    matcap_color: vec4<f32>,
    eye_highlight_color: vec4<f32>, // HDR (~2.2); the tonemap shoulder absorbs it
    eye_scattering_color: vec4<f32>,
}
