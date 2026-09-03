// Hair specular normal subsystem (_UseSpecBumpMap): the specular half of _SplitNormalMap —
// ba, scaled by _SpecBumpScale — that the Kajiya-Kay lobes and the edge fade read
// (hgrp-decompiled-formulas.md §3; probe 2026-09-03: both halves stay inside the unit disc).
// The diffuse half, rg, is the hair normal-map subsystem's (lighting/hgrp/hair_diffuse_normal.wgsl).
// Off-stub: the geometric normal.
fn hgrp_hair_spec_normal(
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    uv: vec2<f32>,
) -> vec3<f32> {
    let n = normalize(world_normal);
    let tbn = mat3x3<f32>(normalize(world_tangent), normalize(world_bitangent), n);
    let encoded = textureSample(split_normal_map, base_sampler, uv).ba;
    return hgrp_split_normal(tbn, encoded, hgrp_material.spec_bump_scale);
}
