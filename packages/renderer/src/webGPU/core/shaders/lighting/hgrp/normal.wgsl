// Normal map subsystem (_UseBumpMap): tangent-space normal mapping of the interpolated normal
// by _BumpMap, xy scaled by _BumpScale. Only permutations with the subsystem on declare the
// binding and pay for the sample. Off-stub: the normalized geometric normal.
fn hgrp_shading_normal(
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    uv: vec2<f32>,
) -> vec3<f32> {
    let n = normalize(world_normal);
    let sample = textureSample(bump_map, base_sampler, uv).xyz * 2.0 - 1.0;
    let tbn = mat3x3<f32>(normalize(world_tangent), normalize(world_bitangent), n);
    let scale = hgrp_material.bump_scale;
    return normalize(tbn * (sample * vec3<f32>(scale, scale, 1.0)));
}
