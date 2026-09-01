// HGRP shadow-color LUT sampling. _ShadowLutTex is a 32^3 color-grading LUT flattened to
// 1024x32: 32 slices along X (blue axis), red along X within a slice, green along Y
// **flipped** (g=1 at the top row — verified against the ripped femaleskincolor LUT, where
// input black maps to black and input white to the warm beige skin-shadow tone).
// Pure function: the texture is passed in, so only variants that declare a LUT binding pay
// for it. Use a clamp sampler; the half-texel inset keeps linear filtering inside one slice.
fn hgrp_sample_shadow_lut(
    lut: texture_2d<f32>,
    lut_sampler: sampler,
    color: vec3<f32>,
) -> vec3<f32> {
    let c = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
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
