// HGRP/CharacterNPR_Hair: ramp shadow blend with HSV shadow color, the _LineMap hairline
// strands, and the RS band highlight.
//
// Band hypothesis v5 "angel ring" (2026-09-01, from the in-game reference screenshot: the
// highlight is a broad soft horizontal band across the bangs that tracks the camera, not a
// geometric dot(strand, h) lobe — v2-v4 all produced halos, see hgrp-shading.md): the RS x
// coordinate is the VIEW-SPACE normal elevation centered on _AnisotropyValue (0.5 = the RS
// peak). Points whose normal is view-horizontal sample the crisp band; the crown drifts
// into the soft right-half tail; downward-facing strands fall into the dark left half.
// _AnisotropyValue is GUI-tunable so the band center can be verified live.
// Binding indices must match the HGRP_TEXTURE_SLOTS_BY_VARIANT slot order in
// HGRPMaterialResources.ts.

@group(2) @binding(5) var spec_ramp_map: texture_2d<f32>; // _SpecRampMap
@group(2) @binding(9) var line_map: texture_2d<f32>; // _LineMap

// Formula-unit normalization, same rationale as HGRP_RIM_FORMULA_SCALE: the official
// _AnisotropyIntensity (3.0) belongs to the game's band formula (unknown); raw release
// whitewashed the whole band area under ACES.
const HGRP_ANISO_FORMULA_SCALE: f32 = 0.1;

fn hgrp_hair_band(world_normal: vec3<f32>) -> vec3<f32> {
    let n_view = normalize((mvp.view_matrix * vec4<f32>(normalize(world_normal), 0.0)).xyz);
    // Folded coordinate: only the crisp left half + peak of the RS is sampled — the signed
    // form drifted every upward normal into the mid-bright right tail and lifted the whole
    // hair (v5 first browser check).
    let x = hgrp_ramp_inset(hgrp_material.aniso_value - abs(n_view.y) * 0.5);
    let y = hgrp_ramp_inset(1.0 - hgrp_material.spec_smoothness);
    let band = textureSample(spec_ramp_map, ramp_sampler, vec2<f32>(x, y)).rgb;
    return band * (hgrp_material.aniso_intensity * HGRP_ANISO_FORMULA_SCALE);
}

// The LineMap is a 1D strand-intensity pattern (every row identical — thin bright lines on
// black, probed 2026-09-01), tiled across the strand axis (uv.x; base_sampler wraps). The
// lines darken/desaturate the shaded color through the same HSV adjustment family as
// shadows/outline. _LineAmount anchors at the preset value 300 = 1x tiling (v1 assumption).
fn hgrp_hair_lines(shaded: vec3<f32>, uv0: vec2<f32>) -> vec3<f32> {
    let tiling = hgrp_material.line_amount * (1.0 / 300.0);
    let line = textureSample(line_map, base_sampler, vec2<f32>(uv0.x * tiling, uv0.y)).r;
    let line_color = hgrp_hsv_shadow_color(
        shaded,
        hgrp_material.line_value,
        hgrp_material.line_saturation,
    );
    let mask = smoothstep(1.0 - hgrp_material.line_range, 1.0, line) *
        hgrp_material.line_intensity * hgrp_material.use_line_map;
    return mix(shaded, line_color, clamp(mask, 0.0, 1.0));
}

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let shaded = hgrp_shade_standard(input.uv0, input.world_normal, input.world_position);
    let lined = hgrp_hair_lines(shaded.rgb, input.uv0);
    return vec4<f32>(lined + hgrp_hair_band(input.world_normal), shaded.a);
}
