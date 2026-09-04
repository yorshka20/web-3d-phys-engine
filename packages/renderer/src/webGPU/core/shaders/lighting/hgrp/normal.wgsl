// Normal map subsystem (_UseBumpMap): tangent-space normal mapping of the interpolated normal
// by _BumpMap. Only permutations with the subsystem on declare the binding and pay for the
// sample. Off-stub: the normalized geometric normal.
//
// _BumpMap holds only two channels: x in R times A (the DXT5nm unpack the game keeps, which is
// the identity on a map whose alpha is opaque) and y in G, with **B unused and authored as
// zero** in every ripped map. Z is therefore reconstructed from xy, not sampled — reading B
// would flip the shading normal into the surface. _BumpScale scales xy only, after the
// reconstruction, so the tilt grows without the normal leaving the unit sphere
// (hgrp-decompiled-formulas.md §1.2; the same order lighting/hgrp_npr.wgsl's split normal uses).
fn hgrp_shading_normal(
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    uv: vec2<f32>,
) -> vec3<f32> {
    let n = normalize(world_normal);
    let packed = textureSample(bump_map, base_sampler, uv);
    let xy = vec2<f32>(packed.x * packed.w, packed.y) * 2.0 - 1.0;
    let z = max(1e-16, sqrt(1.0 - clamp(dot(xy, xy), 0.0, 1.0)));
    let tbn = mat3x3<f32>(normalize(world_tangent), normalize(world_bitangent), n);
    return normalize(tbn * vec3<f32>(xy * hgrp_material.bump_scale, z));
}
