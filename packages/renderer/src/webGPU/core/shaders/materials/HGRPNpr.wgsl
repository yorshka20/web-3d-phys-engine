// HGRP/CharacterNPR (cloth / general): normal-mapped ramp shadow blend with HSV shadow
// color, spec-ramp highlights on the metallic zones, and HDR emission (rolls off through
// the tonemap shoulder). Binding indices must match the HGRP_TEXTURE_SLOTS_BY_VARIANT slot
// order in HGRPMaterialResources.ts.

@group(2) @binding(5) var bump_map: texture_2d<f32>; // _BumpMap
@group(2) @binding(6) var spec_ramp_map: texture_2d<f32>; // _SpecRampMap
@group(2) @binding(7) var metallic_gloss_map: texture_2d<f32>; // _MetallicGlossMap
@group(2) @binding(8) var emission_map: texture_2d<f32>; // _EmissionMap

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_perturb_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        bump_map,
        base_sampler,
        input.uv0,
        hgrp_material.use_bump_map,
        hgrp_material.bump_scale,
    );
    let core = hgrp_shade_core(input.uv0, n, input.position);

    // Spec ramp v2: the cloth RS is bright across its full width, so it is a specular COLOR
    // lookup (tint per x = n.h, y = 1 - _Smoothness), not a self-shaped highlight — adding it
    // raw whitewashed the cloth. The highlight shape comes from a Blinn-Phong lobe whose
    // exponent follows _Smoothness, gated to the lit side and masked to the metallic zones
    // in _MetallicGlossMap.r so fabric stays matte.
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let light = normalize(MAIN_LIGHT_DIRECTION);
    let h = normalize(light + view_dir);
    let ndoth = clamp(dot(n, h), 0.0, 1.0);
    let ndotl = clamp(dot(n, light), 0.0, 1.0);
    let spec_y = hgrp_ramp_inset(1.0 - hgrp_material.spec_smoothness);
    let spec_color = textureSample(
        spec_ramp_map,
        ramp_sampler,
        vec2<f32>(hgrp_ramp_inset(ndoth), spec_y),
    ).rgb;
    let shape = pow(ndoth, mix(8.0, 128.0, hgrp_material.spec_smoothness));
    let metallic = textureSample(metallic_gloss_map, base_sampler, input.uv0).r;
    let spec = spec_color *
        (shape * smoothstep(0.0, 0.3, ndotl) * metallic * hgrp_material.spec_intensity *
            hgrp_material.use_spec_ramp);

    let emission = textureSample(emission_map, base_sampler, input.uv0).rgb *
        hgrp_material.emission_color.rgb *
        (hgrp_material.emission_brightness * hgrp_material.use_emission);

    // Pantyhose v2 (_Pantyhose, tights on cloth_04). Grounded in the base texture (probed
    // 2026-09-01): the tights region's RGB is the pre-mixed warm skin-through tone and its
    // ALPHA (~0.52, kept just above the clip threshold) is the authored fabric-density map —
    // so sheerness derives from (1 - base alpha). Facing the viewer the fabric thins out and
    // the lit through-tone glows (transmit, scaled by _PantyhoseSpecularValue); edge-on the
    // layers stack up and densify toward _PantyhoseColor (its alpha = layer weight). The
    // silky sheen is a Kajiya-Kay lobe along the tangent rotated by
    // _PantyhoseAnisotropyDirection (-1..1 read as quarter turns, v1 assumption — the
    // formula did not survive the rip).
    let ndotv = clamp(dot(n, view_dir), 0.0, 1.0);
    let density = pow(1.0 - ndotv, 2.0);
    var color = mix(
        core.rgb,
        hgrp_material.pantyhose_color.rgb,
        density * hgrp_material.pantyhose_color.a * hgrp_material.use_pantyhose,
    );

    let sheer = clamp((1.0 - core.a) * 2.0, 0.0, 1.0);
    let transmit = (ndotv * ndotv) * (0.4 + 0.6 * ndotl) * sheer *
        hgrp_material.pantyhose_specular_value;
    color += core.rgb * (transmit * hgrp_material.use_pantyhose);

    let angle = hgrp_material.pantyhose_aniso_direction * HALF_PI;
    let strand = normalize(
        normalize(input.world_tangent) * cos(angle) +
        normalize(input.world_bitangent) * sin(angle),
    );
    let strand_dot_h = dot(strand, h);
    let sin_th = sqrt(max(0.0, 1.0 - strand_dot_h * strand_dot_h));
    let sheen = pow(sin_th, 16.0) *
        (hgrp_material.pantyhose_specular_int * 1.5 * hgrp_material.use_pantyhose);

    return vec4<f32>(color + vec3<f32>(sheen) + spec + emission, core.a);
}
