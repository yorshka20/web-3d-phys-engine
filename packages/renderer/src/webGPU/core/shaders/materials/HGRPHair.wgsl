// HGRP/CharacterNPR_Hair: shade blend under the NPR lighting multiplier through the diffuse
// half of _SplitNormalMap, and the hair shader's Kajiya-Kay specular
// (hgrp-decompiled-formulas.md §3): three lobes around a strand tangent shifted along the
// specular normal — the primary band colored by the spec ramp, a secondary band in
// _AnisotropyColor2 where the primary is weak, and a third lobe that gates the darkening and
// desaturation of the strand lines. Every lobe fades with the horizontal n.v in object space.
// The surface map's G is the specular scalar (Pelica's _Specular is 0 and its map lights only
// the bangs cards — the in-game single band), its R selects the strand direction (0 = the
// object-space up projected onto the strand plane, 1 = the mesh bitangent) and its A scales
// the secondary lobe. Group-2 bindings and the subsystem hooks come from the permutation's
// generated fragments (material/hgrp).

// A Kajiya-Kay lobe: the sine of the angle between a strand tangent and the half vector,
// raised to the lobe exponent, with the game's 1e-4 floor under the power.
fn hgrp_kajiya(tdoth: f32, exponent: f32) -> f32 {
    return pow(max(sqrt(max(1.0 - tdoth * tdoth, 0.0)), 1e-4), exponent);
}

// Lobe exponent from a range parameter: int(200 (1 - range)), truncated as the game does.
fn hgrp_kajiya_exponent(range: f32) -> f32 {
    return f32(i32(200.0 * max(1.0 - range, 0.0)));
}

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    // Both normals come from _SplitNormalMap: rg through the normal-map subsystem's hair
    // include, ba through the hair specular-normal subsystem.
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let n_spec = hgrp_hair_spec_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let surface = hgrp_metallic_gloss(input.uv0);
    // The hair shader's diffuse fraction is 0.96 whatever the surface map's R holds — its
    // metallic is folded to zero in the decompiled code (hair variant b126) and R selects the
    // strand direction below — so the core sees no metallic here.
    let core = hgrp_shade_core(
        input.uv0,
        n,
        n,
        scene_lighting.env_color.rgb,
        vec4<f32>(0.0, surface.gba),
        view_dir,
    );

    // Strand frame: the object-space up tilted by _AnisotropyDirX, projected onto the plane of
    // the specular normal — or the mesh bitangent where the surface map's R says so.
    let to_world = hgrp_object_to_world();
    let to_object = transpose(to_world);
    let strand_up = normalize(to_world * vec3<f32>(hgrp_material.aniso_dir_x, 1.0, 0.0));
    let tangent = normalize(input.world_tangent);
    let handedness = hgrp_tangent_handedness(
        normalize(input.world_normal),
        tangent,
        input.world_bitangent,
    );
    let strand = cross(n_spec, mix(cross(n_spec, strand_up), tangent, surface.r)) *
        mix(1.0, handedness, surface.r);

    // Stylized half vector: the object-space view direction lifted to the light's height,
    // doubled and added to the light, then to the view vector.
    let light = hgrp_light_dir();
    let view_object = to_object * view_dir;
    let lifted = to_world * vec3<f32>(view_object.x, light.y, view_object.z);
    let h = normalize(normalize(light + 2.0 * lifted) + view_dir);

    // Horizontal object-space n.v fade of every lobe: full facing the camera, gone edge-on.
    let n_spec_object = to_object * n_spec;
    let fade = pow(
        clamp(dot(normalize(n_spec_object.xz), normalize(view_object.xz)), 0.0, 1.0),
        hgrp_material.aniso_edge_fade,
    );

    let spec_scalar = surface.g;
    let t1 = normalize(strand + n_spec * (2.0 * hgrp_material.aniso_value - 1.0));
    let t1_dot_h = dot(t1, h);
    let lobe1 = clamp(hgrp_kajiya(t1_dot_h, 200.0) * spec_scalar, 0.0, 1.0);
    // The spec ramp reads the lobe itself along u and the squared fade along v, on the half
    // facing the light only; the fade multiplies once more after the lookup.
    let band = lobe1 * hgrp_spec_ramp_color(lobe1, select(0.0, fade * fade, t1_dot_h > 0.0)) *
        fade;
    let band_max = max(band.r, max(band.g, band.b));

    let t2 = normalize(strand + n_spec * (2.0 * hgrp_material.aniso_value2 - 1.0));
    let lobe2 = hgrp_kajiya(dot(t2, h), hgrp_kajiya_exponent(hgrp_material.aniso_range2)) * fade;
    // F0 = 0.04 x the specular scalar: the folded metallic leaves no albedo in it
    let f0 = vec3<f32>(0.04 * spec_scalar);
    let spec = (band * f0 * (hgrp_material.aniso_intensity * 5.0) +
        mix(lobe2 * hgrp_material.aniso_color2.rgb * surface.a, vec3<f32>(0.0), band_max)) *
        (core.light * hgrp_shade_spec(core.w2));

    // Strand lines: the third lobe gates a darkening of the line pattern where the primary
    // band is weak, scaled by the specular scalar, then the darkened color desaturates toward
    // _LineSaturation.
    let pattern = hgrp_hair_line_pattern(input.uv0);
    let line_term = mix(1.0 - hgrp_material.line_intensity, 1.0, pattern);
    let t3 = normalize(strand + n_spec * (2.0 * hgrp_material.line_value - 1.0));
    let lobe3 = clamp(
        hgrp_kajiya(dot(t3, h), hgrp_kajiya_exponent(hgrp_material.line_range)),
        0.0,
        1.0,
    );
    let line_dark = mix(1.0, mix(1.0, mix(line_term, 1.0, band_max), lobe3), spec_scalar);
    let shaded = core.lit * line_dark;
    let diffuse = mix(
        vec3<f32>(hgrp_luma(shaded)),
        shaded,
        mix(hgrp_material.line_saturation, 1.0, line_dark),
    );

    return hgrp_debug_view(
        vec4<f32>(hgrp_bright_saturation(diffuse + spec), core.alpha),
        input.uv0,
    );
}
