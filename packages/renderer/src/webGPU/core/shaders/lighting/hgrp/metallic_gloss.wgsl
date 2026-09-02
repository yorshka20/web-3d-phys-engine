// Metallic/gloss subsystem (_UseMetallicGlossMap). Channel roles of _MetallicGlossMap, from the
// three cloth maps and two hair maps probed against the meshes (2026-09-02, hgrp-shading.md):
// R holds discrete METALLIC zones (cloth plateaus 0 / 0.4 / 0.73 / 1; on hair it labels a
// region the hair shader does not treat as metal), G is the SPECULAR REGION mask (~1 across
// cloth; on hair only the highlight-bearing cards — Pelica's bangs), A is per-texel SMOOTHNESS
// scaled by _Smoothness (fabric ~0.4, metal zones ~0.7, Pelica hair 1 — Unity's
// _MetallicGlossMap convention). B is unread. Returns (metallic, spec mask, smoothness).
// Off-stub (0, 1, 1): no metal, specular everywhere, gloss = _Smoothness alone.
fn hgrp_metallic_gloss(uv0: vec2<f32>) -> vec3<f32> {
    let p = textureSample(metallic_gloss_map, base_sampler, uv0);
    return vec3<f32>(p.r, p.g, p.a);
}
