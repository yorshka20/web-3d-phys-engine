// HGRP/CharacterNPR_Hair: ramp shadow blend with HSV shadow color, the _LineMap hairline
// strands (lighting/hgrp/hair_lines.wgsl), and the RS band highlight.
//
// Band hypothesis v5 "angel ring" (2026-09-01, from the in-game reference screenshot: the
// highlight is a broad soft horizontal band across the bangs that tracks the camera, not a
// geometric dot(strand, h) lobe — v2-v4 all produced halos, see hgrp-shading.md): the RS x
// coordinate is the VIEW-SPACE normal elevation centered on _AnisotropyValue (0.5 = the RS
// peak). Points whose normal is view-horizontal sample the crisp band; the crown drifts
// into the soft right-half tail; downward-facing strands fall into the dark left half.
// _AnisotropyValue is GUI-tunable so the band center can be verified live.
//
// v6 (2026-09-02, texture forensics): the band reads its own normal — the geometric normal
// tilted per strand by _SplitNormalMap (lighting/hgrp/hair_split_normal.wgsl), so the ring
// breaks into strand-wise offsets — and _MetallicGlossMap gates it: .g is the highlight
// region (on Pelica only the bangs cards, where the in-game band sits) and .a the per-texel
// smoothness that picks the RS row together with _Smoothness.
// Group-2 bindings and the subsystem hooks come from the permutation's generated fragments
// (material/hgrp).

// Formula-unit normalization, same rationale as HGRP_RIM_FORMULA_SCALE: the official
// _AnisotropyIntensity (3.0) belongs to the game's band formula (unknown); raw release
// whitewashed the whole band area under ACES.
const HGRP_ANISO_FORMULA_SCALE: f32 = 0.1;

// The band reads the specular normal (geometric normal + per-strand shift), never the
// _BumpMap-perturbed shading normal: it is a broad camera-tracking sheen, and a normal map's
// per-texel detail would only break it up.
fn hgrp_hair_band(n_spec: vec3<f32>, spec_mask: f32, smoothness: f32) -> vec3<f32> {
    let n_view = normalize((mvp.view_matrix * vec4<f32>(n_spec, 0.0)).xyz);
    // Folded coordinate: only the crisp left half + peak of the RS is sampled — the signed
    // form drifted every upward normal into the mid-bright right tail and lifted the whole
    // hair (v5 first browser check).
    let band = hgrp_spec_ramp_color(
        hgrp_material.aniso_value - abs(n_view.y) * 0.5,
        hgrp_material.spec_smoothness * smoothness,
    );
    return band * scene_lighting.light.rgb *
        (hgrp_material.aniso_intensity * HGRP_ANISO_FORMULA_SCALE * spec_mask);
}

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let n_geom = normalize(input.world_normal);
    let shaded = hgrp_shade_core(input.uv0, n_geom, n, input.position);
    let lined = hgrp_hair_lines(shaded.lit + hgrp_ambient(shaded.albedo, n_geom), input.uv0);

    let n_spec = hgrp_hair_spec_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let mg = hgrp_metallic_gloss(input.uv0);
    return vec4<f32>(lined + hgrp_hair_band(n_spec, mg.y, mg.z), shaded.alpha);
}
