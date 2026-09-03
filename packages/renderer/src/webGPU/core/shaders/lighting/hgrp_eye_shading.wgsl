// Shared Eye-variant fragment shading (brow + iris), used by the material shader
// (materials/HGRPEye.wgsl), the eye overlay shader (passes/hgrp_eye_overlay.wgsl) and the
// brow-through shader. References the common HGRP bindings plus the permutation's hooks
// (hgrp_shadow_color, hgrp_ramp, hgrp_eye_matcap) and the shading core's light(N) and shade
// blend (lighting/hgrp_npr.wgsl); the eye reads the hemisphere through the horizontal normal
// and the cloth/hair environment color (formulas §4).

fn hgrp_shade_eye(
    uv0: vec2<f32>,
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    world_position: vec3<f32>,
) -> vec4<f32> {
    let n = normalize(world_normal);
    // Iris parallax: shift the sampled UV along the tangent-space view direction to fake
    // eye depth (_ParallaxScale 0.03 on the iris). Gated to the iris — the brow carries an
    // unrelated 0.5 that would tear its UVs apart.
    let is_iris = hgrp_material.is_iris > 0.5;
    let view_dir = normalize(mvp.camera_pos - world_position);
    let t_view = vec2<f32>(
        dot(view_dir, normalize(world_tangent)),
        dot(view_dir, normalize(world_bitangent)),
    );
    let uv = uv0 - t_view * (hgrp_material.parallax_scale * hgrp_material.is_iris);

    let base = hgrp_base_color(uv);
    let tinted = base.rgb * hgrp_material.eye_tint_color.rgb;
    let ndotl = dot(n, hgrp_light_dir());
    let shade_nl = clamp(ndotl + scene_lighting.light_dir.w, -1.0, 1.0);

    let shadow_color = hgrp_shadow_color(tinted);

    // Unlit iris: the in-game iris is uniformly luminous with no diffuse terminator
    // (reference screenshot, 2026-09-01) — the iris forces the lit tier of the shade blend,
    // while the brow keeps ramp shading. The role comes from the descriptor's eyeLayer
    // (material/hgrp/descriptor.ts), not from a feature gate. The eye rewrite (formulas §4)
    // puts the iris back on the ramp.
    let ramp = select(hgrp_ramp(shade_nl), vec4<f32>(1.0), is_iris);
    let ramp_view = select(hgrp_ramp(dot(n, hgrp_cam_dir())).a, 1.0, is_iris);

    // No surface map and no SDF on the eye: occlusion 1, metallic 0
    let blend = hgrp_shade_blend(tinted, shadow_color, ramp, ramp_view, 1.0, 0.0);
    var color = hgrp_light(hgrp_horizontal(n), scene_lighting.env_color.rgb, blend.w2) *
        blend.col;

    // _EyeScatteringColor is DARK-PART transmission (v3 interpretation): a global multiply
    // blew the already-bright lower iris to white while the game keeps it structured — so
    // the lift fades out with luminance, turning the dark navy ring into the game's glowing
    // deep blue and leaving bright regions untouched (identity color on the brow). The base
    // alpha is the catchlight mask (NOT opacity), scaled by the HDR _EyeHighLightColor and
    // rolled off through the tonemap curve.
    let luma = clamp(dot(color, vec3<f32>(0.299, 0.587, 0.114)), 0.0, 1.0);
    color *= mix(hgrp_material.eye_scattering_color.rgb, vec3<f32>(1.0), luma);
    color += hgrp_eye_matcap(n);
    color = hgrp_bright_saturation(color);
    color += hgrp_material.eye_highlight_color.rgb * (base.a * hgrp_material.eye_highlight);

    return vec4<f32>(color, base.a);
}
