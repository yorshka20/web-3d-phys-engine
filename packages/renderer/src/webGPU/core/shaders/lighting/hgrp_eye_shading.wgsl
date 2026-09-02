// Shared Eye-variant fragment shading (brow + iris), used by the material shader
// (materials/HGRPEye.wgsl), the eye overlay shader (passes/hgrp_eye_overlay.wgsl) and the
// brow-through shader. References the common HGRP bindings plus the permutation's hooks
// (hgrp_shadow_color, hgrp_ramp_weight, hgrp_eye_matcap).

fn hgrp_shade_eye(
    uv0: vec2<f32>,
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    world_position: vec3<f32>,
    frag_coord: vec4<f32>,
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

    let shadow_color = hgrp_shadow_color(tinted);

    // Unlit iris: the in-game iris is uniformly luminous with no diffuse terminator
    // (reference screenshot, 2026-09-01) — the iris forces full lit weight and takes no
    // rim, while the brow keeps ramp shading. The role comes from the descriptor's eyeLayer
    // (material/hgrp/descriptor.ts), not from a feature gate.
    let w = select(hgrp_ramp_weight(ndotl * 0.5 + 0.5), vec3<f32>(1.0), is_iris);
    let rim = select(hgrp_rim(n, frag_coord, ndotl), vec3<f32>(0.0), is_iris);

    // _EyeScatteringColor is DARK-PART transmission (v3 interpretation): a global multiply
    // blew the already-bright lower iris to white while the game keeps it structured — so
    // the lift fades out with luminance, turning the dark navy ring into the game's glowing
    // deep blue and leaving bright regions untouched (identity color on the brow). The base
    // alpha is the catchlight mask (NOT opacity), scaled by the HDR _EyeHighLightColor and
    // rolled off through the tonemap curve.
    var color = mix(shadow_color, tinted, w) * scene_lighting.light.rgb + hgrp_ambient(tinted, n);
    let luma = clamp(dot(color, vec3<f32>(0.299, 0.587, 0.114)), 0.0, 1.0);
    color *= mix(hgrp_material.eye_scattering_color.rgb, vec3<f32>(1.0), luma);
    color += hgrp_eye_matcap(n);
    color += hgrp_material.eye_highlight_color.rgb * (base.a * hgrp_material.eye_highlight);

    return vec4<f32>(color + rim, base.a);
}
