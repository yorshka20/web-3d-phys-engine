// Surface-parameter subsystem (_UseMetallicGlossMap): _MetallicGlossMap, whose channels the
// game's shader Properties name "RGBA: Metal, Spec, Shadow, Smooth" (hgrp-decompiled-formulas.md
// §1.5 / §1.7 / §1.9). R is the metallic amount — kd = 0.96 (1 - R), F0 = lerp(0.04 G, albedo, R);
// G the dielectric specular amount; B the lighting ceiling, w2 = min(B, ramp.a) — the authored
// occlusion of seams, folds and collars; A the smoothness, roughness = 1 - A. Off-stub: the
// material's scalar parameters in the same order (_Metallic, _Specular, 1, _Smoothness), which
// is what the game reads when the map is off.
fn hgrp_metallic_gloss(uv0: vec2<f32>) -> vec4<f32> {
    return textureSample(metallic_gloss_map, base_sampler, uv0);
}
