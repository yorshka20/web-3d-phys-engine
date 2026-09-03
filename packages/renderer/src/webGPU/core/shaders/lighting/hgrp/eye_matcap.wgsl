// Eye matcap subsystem (_UseMatcap), the _MATCAP_ON path of the eye shader
// (hgrp-decompiled-formulas.md §4): the iris parallax — the tangent-space view direction times
// _ParallaxScale, a quarter of it along v, fading out toward the rim of the UV disc — and the
// matcap read by the view-space sphere normal, composed as M.rgb x _MatcapColor.a +
// _MatcapColor.rgb x M.a. The eye shader adds the term on top of the shaded iris, lit and
// shadow-attenuated like a highlight. Off-stub: no offset, no term (the brow).
fn hgrp_eye_matcap(
    view_tangent: vec3<f32>,
    disc_r2: f32,
    n_matcap: vec3<f32>,
) -> HGRPEyeMatcap {
    let uv_offset = view_tangent.xy *
        (hgrp_material.parallax_scale * vec2<f32>(1.0, 0.25) * smoothstep(0.25, 0.05, disc_r2));
    let n_view = normalize((mvp.view_matrix * vec4<f32>(n_matcap, 0.0)).xyz);
    // Unity's v grows upward; the texture is uploaded in file row order
    let uv = vec2<f32>(n_view.x, -n_view.y) * 0.5 + 0.5;
    let m = textureSample(matcap_tex, base_sampler, uv);
    let mc = hgrp_material.matcap_color;
    return HGRPEyeMatcap(uv_offset, m.rgb * mc.a + mc.rgb * m.a);
}
