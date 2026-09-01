// Shared HGRP NPR shading core. References the common HGRP bindings declared by
// bindings/hgrp_bindings.wgsl (hgrp_material, base_map, diff_ramp_map, base_sampler,
// ramp_sampler) and the HSV helpers from math/color.wgsl.
//
// Shading model derived from the ripped data (renderer-material-family.md, hgrp-pipeline.md):
// the 256x1 DiffRamp holds per-channel blend weights between a shadow color and the base
// color — black below the terminator, a warm transition band, white on the lit side — so
// `mix(shadow_color, base, ramp)` reproduces the tinted terminator without ever multiplying
// the dark side to black. The shadow color comes from a 32^3 color-grading LUT for the skin
// family (_UseShadowLutTex) or an HSV adjustment of the base color
// (_ShadowColorBrightness/_ShadowColorSaturation) for everything else. The ramp coordinate
// is half-Lambert n.l by default; the skin variant substitutes its SDF face-shadow factor.

// HGRP diffuse ramps are 256x1 LUTs; sample half a texel away from the edges so clamp
// addressing doesn't bleed the outermost texels.
fn hgrp_ramp_inset(u: f32) -> f32 {
    return clamp(u, 1.0 / 512.0, 1.0 - 1.0 / 512.0);
}

// Base sample with alpha clip (alpha_cutoff 0 = disabled).
fn hgrp_base_color(uv0: vec2<f32>) -> vec4<f32> {
    let base = textureSample(base_map, base_sampler, uv0) * hgrp_material.base_color;
    if hgrp_material.alpha_cutoff > 0.0 && base.a < hgrp_material.alpha_cutoff {
        discard;
    }
    return base;
}

// Shadow color for materials without a LUT: HSV-adjusted base color (the classic anime
// shadow: darker, slightly more saturated).
fn hgrp_hsv_shadow_color(base: vec3<f32>, brightness: f32, saturation: f32) -> vec3<f32> {
    var hsv = rgb_to_hsv(base);
    hsv.y = clamp(hsv.y * saturation, 0.0, 1.0);
    hsv.z = hsv.z * brightness;
    return hsv_to_rgb(hsv);
}

// Per-channel shadow/base blend weights from the diffuse ramp, indexed by a 0..1 shade
// coordinate (half-Lambert n.l, or the SDF factor on faces); materials that disable the
// ramp fall back to a smooth scalar terminator.
fn hgrp_shadow_weight(shade_coord: f32, use_ramp: f32) -> vec3<f32> {
    let ramp = textureSample(
        diff_ramp_map,
        ramp_sampler,
        vec2<f32>(hgrp_ramp_inset(shade_coord), 0.5),
    ).rgb;
    let fallback = vec3<f32>(smoothstep(0.25, 0.75, shade_coord));
    return select(fallback, ramp, use_ramp > 0.5);
}

// Tangent-space normal mapping. Pure function (textures passed in) so only variants with a
// bump binding pay for it; no-op when the material disables bump.
fn hgrp_perturb_normal(
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    bump: texture_2d<f32>,
    bump_sampler: sampler,
    uv: vec2<f32>,
    use_bump: f32,
    scale: f32,
) -> vec3<f32> {
    let n = normalize(world_normal);
    let sample = textureSample(bump, bump_sampler, uv).xyz * 2.0 - 1.0;
    let tbn = mat3x3<f32>(normalize(world_tangent), normalize(world_bitangent), n);
    let perturbed = normalize(tbn * (sample * vec3<f32>(scale, scale, 1.0)));
    return select(n, perturbed, use_bump > 0.5);
}

// View-dependent fresnel rim, masked toward the lit side.
// Stage E dependency: HGRP rim intensities (up to 4.0 on skin) assume the game's HDR +
// tonemap pipeline; without it the additive term blows out, so the intensity is clamped
// and scaled down here — remove the clamp when Stage E lands.
fn hgrp_rim(n: vec3<f32>, view_dir: vec3<f32>, ndotl: f32) -> vec3<f32> {
    let ndotv = clamp(dot(n, view_dir), 0.0, 1.0);
    let edge = smoothstep(1.0 - hgrp_material.rim_width, 1.0, 1.0 - ndotv);
    let intensity = min(hgrp_material.rim_intensity, 1.0) * 0.35;
    let light_side = clamp(ndotl * 0.5 + 0.5, 0.0, 1.0);
    return hgrp_material.rim_color.rgb * (edge * intensity * light_side);
}

// Base + shadow-blend + rim composition for a given (already normalized) shading normal.
fn hgrp_shade_core(uv0: vec2<f32>, n: vec3<f32>, world_position: vec3<f32>) -> vec4<f32> {
    let base = hgrp_base_color(uv0);
    let ndotl = dot(n, normalize(MAIN_LIGHT_DIRECTION));

    let shadow_color = hgrp_hsv_shadow_color(
        base.rgb,
        hgrp_material.shadow_color_brightness,
        hgrp_material.shadow_color_saturation,
    );
    let w = hgrp_shadow_weight(ndotl * 0.5 + 0.5, hgrp_material.use_diff_ramp);

    let view_dir = normalize(mvp.camera_pos - world_position);
    let rim = hgrp_rim(n, view_dir, ndotl);

    return vec4<f32>(mix(shadow_color, base.rgb, w) + rim, base.a);
}

// Full standard shading for variants without a shadow LUT or bump map (hair for now).
fn hgrp_shade_standard(
    uv0: vec2<f32>,
    world_normal: vec3<f32>,
    world_position: vec3<f32>,
) -> vec4<f32> {
    return hgrp_shade_core(uv0, normalize(world_normal), world_position);
}
