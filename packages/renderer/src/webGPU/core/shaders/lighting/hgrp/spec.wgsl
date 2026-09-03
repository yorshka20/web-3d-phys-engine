// Specular ramp subsystem (_UseSpecRampMap): the RS is a specular COLOR lookup multiplied into
// F0 (hgrp-decompiled-formulas.md §1.9: specColor = F0 x RS). Cloth feeds u = the normalized
// GGX lobe D x alpha^2 (1 at the peak) and v = roughness x (1 - metallic); hair feeds its
// Kajiya-Kay lobe (§3). v is a Unity texture coordinate — origin at the bottom row — while the
// texture is uploaded in file row order, so it is flipped here, the same convention the shadow
// LUT verified against its ripped texture. Half-texel inset on the clamp sampler. Off-stub:
// white, the game's specColor = F0 without the ramp.
fn hgrp_spec_ramp_color(u: f32, v: f32) -> vec3<f32> {
    return textureSample(
        spec_ramp_map,
        ramp_sampler,
        vec2<f32>(hgrp_ramp_inset(u), hgrp_ramp_inset(1.0 - v)),
    ).rgb;
}
