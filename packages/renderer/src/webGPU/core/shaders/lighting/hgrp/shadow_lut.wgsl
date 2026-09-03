// Shadow-color LUT subsystem (_UseShadowLutTex): the shadow color is the base color graded
// through _ShadowLutTex. Off-stub: the luminance/saturation adjustment of the base color (the
// shadow subsystem's _ShadowColorBrightness/_ShadowColorSaturation).
//
// _ShadowLutTex is a 32^3 color-grading LUT flattened to 1024x32: 32 slices along X (blue
// axis), red along X within a slice, green along Y **flipped** (g=1 at the top row — verified
// against the ripped femaleskincolor LUT, where input black maps to black and input white to
// the warm beige skin-shadow tone; Unity's v origin is the bottom row and the texture is
// uploaded in file row order). The LUT lives in display space on both sides: the game's shader
// indexes it by the sRGB-ENCODED albedo (hgrp-decompiled-formulas.md §1.6), so the lookup
// encodes its linear input first, and the texture is created as an sRGB format so sampling
// decodes the output (material/hgrp/textures.ts has the probe that settled it). Use a clamp
// sampler; the half-texel inset keeps linear filtering inside one slice.
fn hgrp_sample_shadow_lut(
    lut: texture_2d<f32>,
    lut_sampler: sampler,
    color: vec3<f32>,
) -> vec3<f32> {
    let c = clamp(linear_to_srgb(color), vec3<f32>(0.0), vec3<f32>(1.0));
    let slice = c.b * 31.0;
    let s0 = floor(slice);
    let s1 = min(s0 + 1.0, 31.0);
    let f = slice - s0;
    let v = (0.5 + (1.0 - c.g) * 31.0) / 32.0;
    let u0 = (s0 * 32.0 + 0.5 + c.r * 31.0) / 1024.0;
    let u1 = (s1 * 32.0 + 0.5 + c.r * 31.0) / 1024.0;
    let col0 = textureSample(lut, lut_sampler, vec2<f32>(u0, v)).rgb;
    let col1 = textureSample(lut, lut_sampler, vec2<f32>(u1, v)).rgb;
    return mix(col0, col1, f);
}

fn hgrp_shadow_color(base: vec3<f32>) -> vec3<f32> {
    return hgrp_sample_shadow_lut(shadow_lut_tex, ramp_sampler, base);
}
