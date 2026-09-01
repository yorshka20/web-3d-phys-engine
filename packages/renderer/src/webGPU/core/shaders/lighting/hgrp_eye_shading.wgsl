// Shared Eye-variant fragment shading (brow + iris), used by the material shader
// (materials/HGRPEye.wgsl) and the eye overlay shader (passes/hgrp_eye_overlay.wgsl).
// References the common HGRP bindings plus a `shadow_lut` texture that each including
// shader declares itself (module-scope declarations are order-independent).
fn hgrp_shade_eye(
    uv0: vec2<f32>,
    world_normal: vec3<f32>,
    world_position: vec3<f32>,
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

    let view_dir = normalize(mvp.camera_pos - world_position);
    let rim = hgrp_rim(n, view_dir, ndotl);

    return vec4<f32>(mix(shadow_color, base.rgb, w) + rim, base.a);
}
