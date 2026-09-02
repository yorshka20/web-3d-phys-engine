// Eye matcap subsystem (_UseMatcap): the matcap texture (near-black with sparse glints, probed
// 2026-09-01) is sampled by the view-space normal so the glints track the eye's orientation
// relative to the camera; _MatcapColor tints them and its alpha scales the layer. Off-stub:
// black.
fn hgrp_eye_matcap(n: vec3<f32>) -> vec3<f32> {
    let n_view = normalize((mvp.view_matrix * vec4<f32>(n, 0.0)).xyz);
    let uv = vec2<f32>(0.5, 0.5) +
        vec2<f32>(n_view.x, -n_view.y) * (0.5 * hgrp_material.matcap_normal_scale);
    let glint = textureSample(matcap_tex, base_sampler, uv).rgb;
    return glint * hgrp_material.matcap_color.rgb * hgrp_material.matcap_color.a;
}
