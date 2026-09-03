// Shared HGRP NPR shading core. References the common HGRP bindings (hgrp_material, base_map,
// base_sampler, ramp_sampler — declared by the permutation's generated group-2 fragment;
// scene_lighting from group 3), the sRGB helpers from math/color.wgsl, and the subsystem hooks
// (lighting/hgrp/*.wgsl, or their generated off-stubs): hgrp_shadow_color, hgrp_shade_coord,
// hgrp_ramp, hgrp_metallic_gloss, hgrp_spec_ramp_color. The hook-free formulas — light(N), the
// shade blend, the specular and IBL terms, the object frame — live in lighting/hgrp_lighting.wgsl
// so a pass that lights through the material's bindings without the hooks (the outline) can
// include them alone.
//
// Shading model: the decompiled character shader (learnings hgrp-decompiled-formulas.md,
// §1 Standard — the section numbers below refer to it). The shaded color is a lighting
// multiplier light(N) times a shade blend col'. The blend picks between the albedo, a shadow
// color and a deep-shadow color by the diffuse ramp's ALPHA capped by the surface map's
// occlusion, and light(N) carries the key light's luma on both sides of the terminator plus a
// hemisphere-shaped environment color — so the dark side sits at its shadow color under the
// same light as the lit side, never at black, and the terminator's hue comes from the ramp's
// rgb. On top, a GGX specular with the shader's stylized half vector and a split-sum IBL with
// multiple-scattering compensation, both scaled by the same lit weight. The shadow color comes
// from a 32^3 color-grading LUT (_UseShadowLutTex) or a luminance/saturation adjustment of the
// base color for everything else. The ramp coordinate is n.l biased by _CharacterParams11.w;
// the SDF subsystem substitutes its face-shadow factor.

// Base sample with alpha clip (alpha_cutoff 0 = disabled).
fn hgrp_base_color(uv0: vec2<f32>) -> vec4<f32> {
    return hgrp_base_color_sampled(uv0, base_sampler);
}

// The same through a caller-chosen sampler: the eye shader reads its base map clamped, as the
// game does, because the parallax pushes the lookup past the card's edge.
fn hgrp_base_color_sampled(uv0: vec2<f32>, s: sampler) -> vec4<f32> {
    let base = textureSample(base_map, s, uv0) * hgrp_material.base_color;
    if hgrp_material.alpha_cutoff > 0.0 && base.a < hgrp_material.alpha_cutoff {
        discard;
    }
    return base;
}

// The eye matcap subsystem's two outputs (lighting/hgrp/eye_matcap.wgsl): the parallax offset
// the base lookup subtracts, and the matcap term added on top of the shaded iris.
struct HGRPEyeMatcap {
    uv_offset: vec2<f32>,
    color: vec3<f32>,
}

// A two-channel tangent-space normal (the halves of the hair's _SplitNormalMap): z rebuilt from
// xy before the scale is applied, as the decompiled shader does, then taken to world space.
fn hgrp_split_normal(tbn: mat3x3<f32>, encoded: vec2<f32>, scale: f32) -> vec3<f32> {
    let xy = encoded * 2.0 - 1.0;
    let z = max(1e-8, sqrt(1.0 - clamp(dot(xy, xy), 0.0, 1.0)));
    return normalize(tbn * vec3<f32>(xy * scale, z));
}

// Result of the shading core: the shaded color light(N) x col', the lighting multiplier
// light(N) on its own, the albedo after the SDF tint (what F0 reads) and the alpha, the lit
// weight w2 (the specular attenuation and the IBL read it) and the specular gate (the SDF
// mask's G on the face, 1 elsewhere) that scales the dielectric F0.
struct HGRPShade {
    lit: vec3<f32>,
    light: vec3<f32>,
    albedo: vec3<f32>,
    alpha: f32,
    w2: f32,
    spec_gate: f32,
}

// Base + shade blend + lighting for a given (already normalized) shading normal `n`, the
// normal the hemisphere reads (`hemi_n`), the variant's environment color and its surface
// parameters (hgrp_metallic_gloss: metallic, specular, occlusion, smoothness). The shadow
// color, the shade value and the ramp come from the permutation's hooks. The shadow color is
// graded from the untinted albedo; the SDF subsystem's _SDFRimColor tint applies to the albedo
// the lit tier and F0 read (§2).
fn hgrp_shade_core(
    uv0: vec2<f32>,
    n: vec3<f32>,
    hemi_n: vec3<f32>,
    env_color: vec3<f32>,
    surface: vec4<f32>,
    view_dir: vec3<f32>,
) -> HGRPShade {
    let base = hgrp_base_color(uv0);
    let ndotl = dot(n, hgrp_light_dir());
    // §1.5: the ramp reads n.l biased by _CharacterParams11.w, clamped to [-1, 1]
    let shade_nl = clamp(ndotl + scene_lighting.light_dir.w, -1.0, 1.0);
    let shade = hgrp_shade_coord(uv0, shade_nl, n, view_dir);
    let ramp = hgrp_ramp(shade.x);
    let ramp_view = hgrp_ramp(dot(n, hgrp_cam_dir())).a;

    let shadow_color = hgrp_shadow_color(base.rgb);
    let albedo = base.rgb * mix(vec3<f32>(1.0), hgrp_material.sdf_rim_color.rgb, shade.y);
    let blend = hgrp_shade_blend(albedo, shadow_color, ramp, ramp_view, surface.b, surface.r);
    let light = hgrp_light(hemi_n, env_color, blend.w2);
    return HGRPShade(light * blend.col, light, albedo, base.a, blend.w2, shade.z);
}
