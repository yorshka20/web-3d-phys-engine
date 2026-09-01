// HGRP material uniform block, shared by the variant shaders (bindings/hgrp_bindings.wgsl)
// and the outline shader (passes/hgrp_outline.wgsl).
// Field order must match the Float32Array layout written by MaterialBinder (304 bytes).
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
    outline_offset_z: f32, // _OutlineOffsetZ — pushes the hull away so inner lines recede
    use_line_map: f32, // _UseLineMap (hair strand lines)
    matcap_color: vec4<f32>,
    eye_highlight_color: vec4<f32>, // HDR (~2.2); the tonemap shoulder absorbs it
    eye_scattering_color: vec4<f32>,
    line_amount: f32, // _LineAmount — strand-line tiling driver (preset 300 = 1x)
    line_intensity: f32, // _LineIntensity
    line_range: f32, // _LineRange
    line_saturation: f32, // _LineSaturation
    line_value: f32, // _LineValue
    use_pantyhose: f32, // _Pantyhose (cloth tights shading)
    pantyhose_specular_int: f32, // _PantyhoseSpecularInt
    pantyhose_specular_value: f32, // _PantyhoseSpecularValue
    pantyhose_aniso_direction: f32, // _PantyhoseAnisotropyDirection (-1..1, quarter-turn units)
    aniso_value: f32, // _AnisotropyValue — hair RS band center (0.5 = the RS peak)
    use_face_highlight: f32, // _FaceHighlightMap (skin: hl_M nose-highlight layer)
    parallax_scale: f32, // _ParallaxScale — iris depth-parallax UV shift (matcap path only)
    pantyhose_color: vec4<f32>,
    highlight_vector: vec4<f32>, // _HighlightMapVector — hl_M UV offset (xy)
    eye_tint_color: vec4<f32>, // _EyeTintColor (identity in Pelica's preset)
    use_metallic_gloss_map: f32, // _UseMetallicGlossMap (cloth spec v3 gate)
    reserved2: f32,
    reserved3: f32,
    reserved4: f32,
}
