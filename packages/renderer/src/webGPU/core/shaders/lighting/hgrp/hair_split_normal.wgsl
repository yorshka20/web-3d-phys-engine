// Hair specular normal subsystem (_UseSpecBumpMap). _SplitNormalMap is not a normal map: every
// channel sits at 0.5 (|rgb - 0.5| averages 0.2, nowhere unit length) and R/B are constant
// along each strand while varying across strands (probed 2026-09-02) — a per-strand SHIFT map,
// the Kajiya-Kay device that breaks a hair highlight into strand-wise offsets. R shifts the
// primary band; B (correlated 0.89 with R) is the secondary lobe's shift, unread until the
// _AnisotropyValue2 lobe exists; G/A are smooth along-strand gradients, unread. The shift
// tilts the highlight normal along the strand axis — the bitangent, since strands run along v
// (the LineMap tiles across u) — scaled by _SpecBumpScale. Off-stub: the geometric normal.
fn hgrp_hair_spec_normal(
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    uv: vec2<f32>,
) -> vec3<f32> {
    let shift = (textureSample(split_normal_map, base_sampler, uv).r * 2.0 - 1.0) *
        hgrp_material.spec_bump_scale;
    return normalize(normalize(world_normal) + normalize(world_bitangent) * shift);
}
