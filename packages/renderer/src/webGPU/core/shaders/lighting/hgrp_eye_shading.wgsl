// Shared Eye-variant fragment shading (brow + iris), used by the material shader
// (materials/HGRPEye.wgsl) and the eye overlay shader (passes/hgrp_eye_overlay.wgsl).
// References the common HGRP bindings plus `shadow_lut` and `matcap_tex` textures that
// each including shader declares itself (module-scope declarations are order-independent).

// Matcap glint layer: the matcap texture (near-black with sparse glints, probed 2026-09-01)
// is sampled by the view-space normal so the glints track the eye's orientation relative to
// the camera; _MatcapColor tints them and its alpha scales the layer.
fn hgrp_eye_matcap(n: vec3<f32>) -> vec3<f32> {
    let n_view = normalize((mvp.view_matrix * vec4<f32>(n, 0.0)).xyz);
    let uv = vec2<f32>(0.5, 0.5) +
        vec2<f32>(n_view.x, -n_view.y) * (0.5 * hgrp_material.matcap_normal_scale);
    let glint = textureSample(matcap_tex, base_sampler, uv).rgb;
    return glint * hgrp_material.matcap_color.rgb *
        (hgrp_material.matcap_color.a * hgrp_material.use_matcap);
}

fn hgrp_shade_eye(
    uv0: vec2<f32>,
    world_normal: vec3<f32>,
    frag_coord: vec4<f32>,
) -> vec4<f32> {
    let base = hgrp_base_color(uv0);
    let n = normalize(world_normal);
    let ndotl = dot(n, normalize(MAIN_LIGHT_DIRECTION));

    let hsv_shadow = hgrp_hsv_shadow_color(
        base.rgb,
        hgrp_material.shadow_color_brightness,
        hgrp_material.shadow_color_saturation,
    );
    let lut_shadow = hgrp_sample_shadow_lut(shadow_lut, ramp_sampler, base.rgb);
    let shadow_color = select(hsv_shadow, lut_shadow, hgrp_material.use_shadow_lut > 0.5);

    let w = hgrp_shadow_weight(ndotl * 0.5 + 0.5, hgrp_material.use_diff_ramp);

    let rim = hgrp_rim(n, frag_coord, ndotl);

    // _EyeScatteringColor lifts the shaded iris into HDR (identity on the brow); the base
    // alpha is the catchlight mask (bright only at the highlight patch, NOT opacity — the
    // probed iris texture is near-zero alpha across the iris body), scaled by the HDR
    // _EyeHighLightColor. Both additive layers roll off through the tonemap shoulder.
    var color = mix(shadow_color, base.rgb, w) * hgrp_material.eye_scattering_color.rgb;
    color += hgrp_eye_matcap(n);
    color += hgrp_material.eye_highlight_color.rgb * (base.a * hgrp_material.eye_highlight);

    return vec4<f32>(color + rim, base.a);
}
