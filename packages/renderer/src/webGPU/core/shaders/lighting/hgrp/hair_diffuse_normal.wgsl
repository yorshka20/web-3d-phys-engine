// Normal map subsystem on hair (_UseBumpMap): the hair shader's _NORMALMAP keyword reads the
// diffuse half of _SplitNormalMap — rg, scaled by _BumpScale — and never samples _BumpMap
// (hair variant b126; the specular half is lighting/hgrp/hair_split_normal.wgsl's). The same
// hook as lighting/hgrp/normal.wgsl, so the two share one off-stub: the geometric normal.
fn hgrp_shading_normal(
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    uv: vec2<f32>,
) -> vec3<f32> {
    let n = normalize(world_normal);
    let tbn = mat3x3<f32>(normalize(world_tangent), normalize(world_bitangent), n);
    let encoded = textureSample(split_normal_map, base_sampler, uv).rg;
    return hgrp_split_normal(tbn, encoded, hgrp_material.bump_scale);
}
