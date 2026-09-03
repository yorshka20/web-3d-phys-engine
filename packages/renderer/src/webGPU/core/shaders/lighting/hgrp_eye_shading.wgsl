// Shared Eye-variant fragment shading (brow + iris), used by the material shader
// (materials/HGRPEye.wgsl), the eye overlay shader (passes/hgrp_eye_overlay.wgsl) and the
// brow-through shader. The decompiled eye shader (hgrp-decompiled-formulas.md §4): the card's
// UV square holds a disc of radius 0.5; inside it the shading normal is a gently domed sphere
// normal and the matcap normal a full one, outside it both are flat. The iris shades through
// the same ramp path as everything else — the HDR _EyeHighLightColor multiplies the albedo
// outside the disc and _EyeScatteringColor where the base alpha is set, under the catchlight
// gate — with the light flattened to the object's horizontal plane, the hemisphere read
// through the horizontal normal and the cloth environment color. References the common HGRP
// bindings, the shading core (hgrp_shade_blend, hgrp_light, hgrp_object_to_world) and the
// permutation's hooks (hgrp_shadow_color, hgrp_ramp, hgrp_eye_matcap).

fn hgrp_shade_eye(
    uv0: vec2<f32>,
    world_normal: vec3<f32>,
    world_tangent: vec3<f32>,
    world_bitangent: vec3<f32>,
    world_position: vec3<f32>,
) -> vec4<f32> {
    let n = normalize(world_normal);
    let t = normalize(world_tangent);
    let b = normalize(world_bitangent);
    let tbn = mat3x3<f32>(t, b, n);
    let view_dir = normalize(mvp.camera_pos - world_position);
    let view_tangent = normalize(vec3<f32>(dot(view_dir, t), dot(view_dir, b), dot(view_dir, n)));

    // The UV disc and the two sphere normals derived from it
    let p = fract(uv0) - 0.5;
    let r2 = dot(p, p);
    let outside = step(0.25, r2);
    let q = p * 2.0;
    let qz = max(1e-8, sqrt(1.0 - clamp(dot(q, q), 0.0, 1.0)));
    let s = hgrp_material.matcap_normal_scale;
    let n_matcap = normalize(tbn * vec3<f32>(-s * q, qz));
    let n_shade = normalize(tbn * mix(vec3<f32>(0.125 * s * q, qz), vec3<f32>(0.0, 0.0, 1.0), outside));

    let matcap = hgrp_eye_matcap(view_tangent, r2, n_matcap);
    let base = hgrp_base_color_sampled(uv0 - matcap.uv_offset, ramp_sampler);
    // The shadow color grades the base color; the HDR multipliers apply to the lit albedo only
    let shadow_color = hgrp_shadow_color(base.rgb);
    let gate = hgrp_material.eye_highlight;
    let albedo = base.rgb *
        mix(vec3<f32>(1.0), hgrp_material.eye_highlight_color.rgb, outside * gate) *
        mix(vec3<f32>(1.0), hgrp_material.eye_scattering_color.rgb, base.a * gate);

    // The ramp reads the light flattened to the object's horizontal plane
    let to_world = hgrp_object_to_world();
    let light_object = transpose(to_world) * hgrp_light_dir();
    let light_h = normalize(to_world * normalize(vec3<f32>(light_object.x, 6.1e-5, light_object.z)));
    let shade_nl = clamp(dot(n_shade, light_h) + scene_lighting.light_dir.w, -1.0, 1.0);
    let ramp = hgrp_ramp(shade_nl);
    let ramp_view = hgrp_ramp(dot(n_shade, hgrp_cam_dir())).a;
    // No surface map on the eye: occlusion 1, metallic 0
    let blend = hgrp_shade_blend(albedo, shadow_color, ramp, ramp_view, 1.0, 0.0);
    let light = hgrp_light(hgrp_horizontal(n_shade), scene_lighting.env_color.rgb, blend.w2);

    let color = light * blend.col + matcap.color * (light * hgrp_shade_spec(blend.w2));
    return vec4<f32>(hgrp_bright_saturation(color), base.a);
}
