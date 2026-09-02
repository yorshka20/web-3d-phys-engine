// Face highlight subsystem (_FaceHighlightMap): hl_M holds a single small grey dot (probed
// 2026-09-01) added on top of the shaded skin; _HighlightMapVector offsets its UV
// (view-tracking in-game, static v1). Off-stub: black.
fn hgrp_face_highlight(uv0: vec2<f32>) -> vec3<f32> {
    let hl = textureSample(
        highlight_map,
        base_sampler,
        uv0 + hgrp_material.highlight_vector.xy,
    ).r;
    return vec3<f32>(hl);
}
