// Face highlight subsystem (_FaceHighlightMap): hl_M holds the nose-tip highlight, read at the
// UV offset by the object-space view direction x _HighlightMapVector so the dot slides with the
// camera (hgrp-decompiled-formulas.md §2). The skin shader adds the result into the specular
// slot, where it is lit like a highlight. Off-stub: black.
fn hgrp_face_highlight(uv0: vec2<f32>, view_dir: vec3<f32>) -> vec3<f32> {
    let view_object = normalize(transpose(hgrp_object_to_world()) * view_dir);
    return textureSample(
        highlight_map,
        base_sampler,
        uv0 + view_object.xy * hgrp_material.highlight_vector.xy,
    ).rgb;
}
