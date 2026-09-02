// Uniform block for HGRP/CharacterNPR_VFX. Kept separate from HGRPMaterialParams because the
// effect shader shares no parameter vocabulary with the CharacterNPR family — it has no
// _BaseMap, no ramp, no rim; instead three sampled layers each carrying their own UV speed
// and channel weights. Field order must match the Float32Array packed by MaterialBinder.
struct HGRPVfxParams {
    tint_color: vec4<f32>, // _TintColor — crimson base glow, a = opacity
    blend_tint: vec4<f32>, // _BlendTint — HDR warm tint on the flow layer
    main_uv_speed: vec4<f32>, // _MainTexUVSpeed (xy scroll per second)
    main_uv_weights: vec4<f32>, // _MainTexUVWeights — which channels form the scalar
    blend_uv_speed: vec4<f32>,
    blend_uv_weights: vec4<f32>,
    mask_uv_speed: vec4<f32>,
    mask_uv_weights: vec4<f32>,
    disturb_uv_speed: vec4<f32>,
    disturb_uv_weights: vec4<f32>,
    disturb_intensity: vec2<f32>, // _DisturbUIntensity1 / _DisturbVIntensity1
    tint_intensity: f32, // _TintColorIntensity — HDR (15 on Laevatian)
    tint_alpha: f32, // _TintColorAlpha
    use_blend: f32, // _UseBlend
    use_disturb: f32, // _UseDisturb
    use_mask: f32, // _UseMask
    use_main_as_alpha: f32, // _UseMainTexAsAlpha
    use_mask_as_alpha: f32, // _UseMaskTexAsAlpha
    main_use_disturb: f32, // _MainTexUseDisturb
    blend_use_disturb: f32, // _BlendTexUseDisturb
    mask_use_disturb: f32, // _MaskTexUseDisturb
    // _ExpIntensity / _ExpThreshold: an exposure-style sharpening whose formula did not
    // survive the rip. Packed so a GUI can A/B them, deliberately not wired into a guessed
    // expression — the same call made for _HairAddTintColor.
    exp_intensity: f32,
    exp_threshold: f32,
    reserved0: f32,
    reserved1: f32,
}
