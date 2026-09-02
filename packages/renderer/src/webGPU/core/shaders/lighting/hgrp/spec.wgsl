// Specular ramp subsystem (_UseSpecRampMap): the RS is a specular COLOR lookup (raw addition
// whitewashes — v1 lesson), u = n.h, v = 1 - gloss, half-texel inset on the clamp sampler.
// Cloth feeds it the Blinn-Phong half vector (materials/HGRPNpr.wgsl), hair its folded
// view-space band coordinate (materials/HGRPHair.wgsl). Off-stub: black, which zeroes the
// whole specular term.
fn hgrp_spec_ramp_color(ndoth: f32, gloss: f32) -> vec3<f32> {
    return textureSample(
        spec_ramp_map,
        ramp_sampler,
        vec2<f32>(hgrp_ramp_inset(ndoth), hgrp_ramp_inset(1.0 - gloss)),
    ).rgb;
}
