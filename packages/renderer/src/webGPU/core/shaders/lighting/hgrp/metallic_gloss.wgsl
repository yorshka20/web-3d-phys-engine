// Metallic/gloss subsystem (_UseMetallicGlossMap): _MetallicGlossMap.r holds discrete METALLIC
// zones, .g per-texel GLOSS (spec v3; B/A unused so far). Returns (metallic, gloss factor).
// Off-stub (0, 1): no metal, gloss = _Smoothness alone.
fn hgrp_metallic_gloss(uv0: vec2<f32>) -> vec2<f32> {
    return textureSample(metallic_gloss_map, base_sampler, uv0).rg;
}
