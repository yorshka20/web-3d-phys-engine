// SDF face shadow subsystem (_UseSDFLightmap), the face shader's shade value and albedo tint
// (hgrp-decompiled-formulas.md §2). Object space is the material's object frame — the head
// joint's posed frame when the material names one (hgrp_object_to_world), which is what the
// game's face renderer uses as its object matrix.
//
// Shade value: _SDFLightmap is sampled at u mirrored when the light comes from the object's -x
// side and read as (R + G) / 2 — the face island carries G = 1 so the near-light side lands in
// [0.5, 1], the mirrored half carries R = 0 so the far side lands in [0, 0.5]. The light's
// horizontal yaw cosine c sets the window of a wide smoothstep over that value and lifts the
// result (2 s + c - 1), so a light 30° off the front leaves the far side at a partial shadow
// instead of black. _SDFMask.g blends back to the biased geometric n.l where the field has no
// authority (ears, jaw underside, sides).
//
// Tint: _SDFRimColor multiplies the albedo at grazing view (1 - (0.15 + 0.85 n.v)), weighted by
// _SDFMask.r, by a camera-azimuth gate (full from the front, half from the side, off from
// behind unless _SDFMask.g) and by the material's _FaceRimOffScale / _SkinRimOffScale chosen
// by _SDFMask.b. Not a rim light: it recolors the albedo that the lit tier and F0 read.
//
// Returns (shade value in [-1, 1], tint weight, specular gate = _SDFMask.g, which scales the
// dielectric F0). Off-stub: (shade_nl, 0, 1).
fn hgrp_shade_coord(
    uv0: vec2<f32>,
    shade_nl: f32,
    n: vec3<f32>,
    view_dir: vec3<f32>,
) -> vec3<f32> {
    // The frame carries the draw's uniform scale; every use below normalizes or takes a sign
    let to_object = transpose(hgrp_object_to_world());
    let light_object = to_object * hgrp_light_dir();
    let mirror = light_object.x > 0.0;
    let uv_sdf = vec2<f32>(select(1.0 - uv0.x, uv0.x, mirror), uv0.y);
    let sdf = textureSample(sdf_lightmap, ramp_sampler, uv_sdf);
    let field = (sdf.r + sdf.g) * 0.5;

    let light_h = normalize(vec3<f32>(light_object.x, 6.1e-5, light_object.z));
    let c2 = light_h.z * 0.5;
    let t = clamp(0.5 - c2, 0.001, 0.999);
    let s = smoothstep(max(2.0 * t - 1.0, 0.0), min(2.0 * t, 1.0), field);
    let sdf_lit = mix(-1.0, 1.0, abs(-s - c2 * ceil(c2)));

    let mask = textureSample(sdf_mask, base_sampler, uv0);
    let shade = mix(sdf_lit, shade_nl, mask.g);

    let cam_object = to_object * hgrp_cam_dir();
    let cam_azimuth = normalize(cam_object.xz).y;
    let face_scale = mask.r * mix(clamp(cam_azimuth + 0.5, 0.0, 1.0), 1.0, mask.g);
    let ndotv = clamp(dot(n, view_dir), 0.0, 1.0);
    let off_scale = mix(
        hgrp_material.face_rim_off_scale,
        hgrp_material.skin_rim_off_scale,
        mask.b,
    );
    let grazing = 1.0 - clamp(0.85 * ndotv + 0.15, 0.0, 1.0);
    let tint = clamp(grazing * face_scale * off_scale, 0.0, 1.0);

    return vec3<f32>(shade, tint, mask.g);
}
