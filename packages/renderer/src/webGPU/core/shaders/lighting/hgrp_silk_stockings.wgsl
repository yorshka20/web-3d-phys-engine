// Silk stockings (_Pantyhose; the game's _SILK_STOCKINGS, hgrp-decompiled-formulas.md §1.12):
// the CharacterNPR material's tights model, transcribed from cloth variants b474 / b391 on the
// dry, mask-less path — the weather system is off (_CharacterParams10 = 0) and the ripped
// presets predate _SilkStockingsMask, so _SilkStockingsDryColor is the identity white and the
// dry-state specular minimum reads as 1 (guess ledger K4). Two terms: a view-dependent coverage
// that pulls the albedo and the shadow color together toward _PantyhoseColor — thin facing the
// viewer, dense at grazing angles — and an anisotropic GGX lobe along the mesh tangent added to
// the specular. A numeric subsystem: the gate is the uniform use_pantyhose, so both terms are
// scaled by it rather than compiled out.

// The coverage lerp's outputs and the sheerness both terms share.
struct HGRPSilkCoverage {
    albedo: vec3<f32>,
    shadow_color: vec3<f32>,
    // clamp(base alpha + 1 - _PantyhoseColor.a, 0, 1): how much skin shows through. The base
    // alpha is the authored fabric density (~0.52 on Pelica's tights) and the color's alpha
    // offsets it, so an opaque _PantyhoseColor leaves the density as painted.
    sheer: f32,
}

// density = lerp(_SilkStockingsMinAffect, _SilkStockingsMaxAffect, sat((1.05 - n.v)^(2 sheer)));
// albedo' = lerp(albedo, _PantyhoseColor.rgb, density), and the shadow color likewise, so the
// shade blend keeps its tiers and the edge darkens toward the color on both sides of the
// terminator. n.v reads the normal-mapped normal.
fn hgrp_silk_coverage(
    albedo: vec3<f32>,
    shadow_color: vec3<f32>,
    base_alpha: f32,
    ndotv: f32,
) -> HGRPSilkCoverage {
    let color = hgrp_material.pantyhose_color;
    let sheer = clamp(base_alpha + 1.0 - color.a, 0.0, 1.0);
    let grazing = clamp(pow(1.05 - ndotv, 2.0 * sheer), 0.0, 1.0);
    let density = mix(hgrp_material.pantyhose_min_affect, hgrp_material.pantyhose_max_affect, grazing) *
        hgrp_material.use_pantyhose;
    return HGRPSilkCoverage(
        mix(albedo, color.rgb, density),
        mix(shadow_color, color.rgb, density),
        sheer,
    );
}

// The anisotropic lobe, added to the GGX term under the same specular color (F0 x RS), the
// shadow-side attenuation and light(N). The anisotropy
// a = -lerp(_PantyhoseAnisotropyDirection, 0.5, sat(base alpha / 2)) x (1 - sat(sheer x _SilkStockingsSpecularFalloff))
// stretches the GGX alpha to alpha_t = (1 + a) alpha along the tangent and alpha_b = (1 - a) alpha
// along the bitangent, evaluated at H2 = normalize(H' + V x _PantyhoseSpecularValue) — the
// "highlight position offset", more V pulls the lobe toward the view direction:
// D = (alpha_t alpha_b)^3 / ((alpha_t T.H2)^2 + (alpha_b B.H2)^2 + (alpha_t alpha_b N.H2)^2)^2,
// clamped at 20 and scaled by _PantyhoseSpecularInt. T is the mesh tangent orthogonalized
// against the shading normal, B = N x T x handedness.
fn hgrp_silk_spec_term(
    n: vec3<f32>,
    world_tangent: vec3<f32>,
    handedness: f32,
    view_dir: vec3<f32>,
    half_vector: vec3<f32>,
    ggx_alpha: f32,
    base_alpha: f32,
    sheer: f32,
) -> f32 {
    let t = normalize(world_tangent - n * dot(world_tangent, n));
    let b = cross(n, t) * handedness;
    let direction = -mix(
        hgrp_material.pantyhose_aniso_direction,
        0.5,
        clamp(base_alpha * 0.5, 0.0, 1.0),
    );
    let aniso = direction *
        (1.0 - clamp(sheer * hgrp_material.pantyhose_spec_falloff, 0.0, 1.0));
    let alpha_t = (1.0 + aniso) * ggx_alpha;
    let alpha_b = (1.0 - aniso) * ggx_alpha;
    let alpha_tb = alpha_t * alpha_b;
    let h2 = normalize(half_vector + view_dir * hgrp_material.pantyhose_specular_value);
    let v = vec3<f32>(alpha_t * dot(t, h2), alpha_b * dot(b, h2), alpha_tb * dot(n, h2));
    let len2 = dot(v, v);
    let num = alpha_tb * alpha_tb * alpha_tb;
    let den = len2 * len2;
    let d = select(1.0, num / den, num != den);
    return clamp(d, 0.0, 20.0) * hgrp_material.pantyhose_specular_int *
        hgrp_material.use_pantyhose;
}
