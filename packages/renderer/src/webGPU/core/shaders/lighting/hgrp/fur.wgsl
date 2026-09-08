// Fur subsystem (_UseCharacterFur, the standard shader's _CHARACTER_FUR keyword;
// hgrp-decompiled-formulas.md §6.2, transcribed from characternpr b519 / b493 and b492). The
// shells are baked into the mesh — copies of the base surface a few hundredths of a millimetre
// apart — and each vertex carries its layer fraction, 0 at the root and 1 at the tip, in uv1.x
// (scripts/hgrp/convert.mjs rebuilds it from the shell spacing; the rip's FBX dropped the second
// UV set). Two hooks. The vertex stage pushes a shell out along its normal, bent toward gravity
// by _FurGravityStrength, by _FurLengthIntensity x layer x 1 cm x the direction map's alpha —
// a length in the asset's metres, so it takes the draw's world scale like every other HGRP
// length (core/hgrp_transform.wgsl); the game's shader leaves it in world metres because its
// characters are drawn at scale 1. The push moves the shell on screen only: the game adds the
// clip-space offset to xyz and leaves w alone, and under its reversed-Z projection the z row
// is scaled by near/far, so a shell's depth stays that of the root surface (to within a few
// depth ulps toward the camera) — a shirt over the skirt covers the fur exactly as it covers
// the skirt. Under this renderer's standard-Z projection the same z offset lands at ~far/near
// times its true size and put the shells metres in front of every garment; keeping z and w
// at the root's is the picture the game draws. The shells then pass one another by draw
// order, which is why the material's _ZTest (LessEqual) reaches the pipeline.
// The fragment stage cuts the shell into strands — the noise map, warped by the direction map
// and a per-layer hash, against a cutoff that grows from the root value to the tip value —
// fades it at grazing angles and with the cube of the layer, darkens the roots and lifts the
// ramp coordinate toward the tips (transmission, more so against the light). Off-stubs: the
// untouched clip position; full coverage from the base alpha, no AO, no lift.

fn hgrp_fur_extrude(
    clip: vec4<f32>,
    world_normal: vec3<f32>,
    uv0_raw: vec2<f32>,
    layer: f32,
) -> vec4<f32> {
    // The offset is formed in clip space from the world normal, as the game does: the view-
    // projection's rotation part maps a world direction to a clip displacement.
    let vp = mvp.projection_matrix * mvp.view_matrix;
    let vp3 = mat3x3<f32>(vp[0].xyz, vp[1].xyz, vp[2].xyz);
    let n = normalize(world_normal);
    let n_clip = vp3 * n;
    let down_clip = vp3 * vec3<f32>(0.0, -1.0, 0.0);
    let g = hgrp_material.fur_gravity_strength;
    let dir = mix(n_clip, down_clip * g + n_clip * (1.0 - g), layer * (0.5 - 0.5 * n.y));
    // The strand length lives in the direction map's alpha, read at the un-tiled uv0 clamped.
    let length = textureSampleLevel(fur_dir_map, ramp_sampler, uv0_raw, 0.0).a;
    let push = dir * (hgrp_material.fur_length_intensity * layer * 0.01 * length * hgrp_model_scale());
    return vec4<f32>(clip.xy + push.xy, clip.zw);
}

fn hgrp_fur_hash(layer: f32) -> f32 {
    return fract(sin(dot(vec2<f32>(layer), vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

// `n_geo` is the interpolated geometric normal, `n` the shading normal after the normal map.
fn hgrp_fur(
    uv0: vec2<f32>,
    layer: f32,
    n_geo: vec3<f32>,
    n: vec3<f32>,
    view_dir: vec3<f32>,
) -> HGRPFur {
    let dir = textureSample(fur_dir_map, base_sampler, uv0);
    let dir_offset = (dir.xy * 2.0 - 1.0) * (0.005 * hgrp_material.fur_dir_map_enable);
    let noise_offset = (hgrp_fur_hash(layer) * 2.0 - 1.0) * (0.05 * hgrp_material.fur_noise);
    let st = hgrp_material.fur_map_st;
    let uv_fur = (uv0 - (dir_offset + vec2<f32>(noise_offset)) * layer) * st.xx + st.zw;
    let noise = textureSample(fur_map, base_sampler, uv_fur).r;

    let cut = mix(hgrp_material.fur_cutoff_start, hgrp_material.fur_cutoff_end, layer);
    let cut_sharp = mix(cut, sqrt(cut), hgrp_material.fur_sharpen);
    let strands = smoothstep(max(cut_sharp - 0.25, 0.0), min(cut_sharp + 0.25, 1.0), noise * dir.z);
    let fade = (1.0 - layer * layer * layer) + (dot(n_geo, view_dir) - hgrp_material.fur_edge_fade);
    // The root shell (layer 0) is solid; the game special-cases it twice (step and ceil).
    let shell = clamp(fade * mix(strands, 1.0, step(layer, 0.01)), 0.0, 1.0);
    let coverage = mix(1.0, shell, ceil(layer));
    if coverage - 0.003 < 0.0 {
        discard;
    }

    // Root AO reads the normal map's z before _BumpScale. The hook has the world normals, not
    // the map: the shading normal's tilt cos c = z / sqrt(s^2 (1 - z^2) + z^2) inverts to z
    // exactly, and gives 1 when no normal map tilted it.
    let c = clamp(dot(n, n_geo), 0.0, 1.0);
    let s = hgrp_material.bump_scale;
    let nz = sqrt(c * c * s * s / max(1.0 + c * c * (s * s - 1.0), 1e-8));
    let root = clamp(nz * 2.0, 0.0, 1.0);
    let ao = mix(hgrp_material.fur_ao * root * root, 1.0, layer);

    // Transmission: the ramp coordinate rises with the layer, from _FurTTIntensity per unit up
    // to 1.15 where the noise thins out against a light behind the character.
    let l = hgrp_light_dir();
    let cam = hgrp_cam_dir();
    let backlight = clamp(-dot(normalize(vec2<f32>(l.x, l.z)), normalize(vec2<f32>(cam.x, cam.z))), 0.0, 1.0);
    let lift = mix(
        hgrp_material.fur_tt_intensity,
        1.15,
        hgrp_material.fur_noise * backlight * smoothstep(0.0, 0.7, 1.0 - noise),
    );
    return HGRPFur(coverage, 1.0, ao, layer * lift);
}
