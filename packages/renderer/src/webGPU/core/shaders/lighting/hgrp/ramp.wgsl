// Diffuse ramp subsystem (_UseDiffRampMap): per-channel shadow/base blend weights from the
// 256x1 _DiffRampMap — black below the terminator, a warm transition band, white on the lit
// side — indexed by a 0..1 shade coordinate (half-Lambert n.l, or the SDF factor on faces).
// Off-stub (generated from this signature): a smooth scalar terminator.
fn hgrp_ramp_weight(shade_coord: f32) -> vec3<f32> {
    return textureSample(
        diff_ramp_map,
        ramp_sampler,
        vec2<f32>(hgrp_ramp_inset(shade_coord), 0.5),
    ).rgb;
}
