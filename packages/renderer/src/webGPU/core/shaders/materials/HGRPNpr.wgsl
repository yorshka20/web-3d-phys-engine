// HGRP/CharacterNPR (cloth / general): normal-mapped ramp shadow blend with HSV (or LUT)
// shadow color, spec-ramp highlights on the metallic zones, HDR emission (rolls off through
// the tonemap shoulder) and the scene ambient on the unsuppressed albedo — a metal zone
// keeps 30% diffuse under the key light but reflects the ambient at full albedo, so silver
// fabric in shadow reads as grey instead of black. Group-2 bindings and the subsystem hooks
// come from the permutation's generated fragments (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let core = hgrp_shade_core(input.uv0, n, input.position);

    // Spec v3 (reference-screenshot driven): the RS stays a specular COLOR lookup (raw
    // addition whitewashes — v1 lesson). _MetallicGlossMap.r holds discrete METALLIC zones:
    // metal has no diffuse, so the shaded base is suppressed there and the albedo tints the
    // spec color (silver parts read as metal instead of white); .a is per-texel SMOOTHNESS
    // modulating the RS row and the Blinn-Phong exponent — the leather/satin sheen on
    // non-metal parts, which v2's metallic-only mask killed (v3 read .g here; the probe of
    // 2026-09-02 found .g ~1 across every cloth map and .a the continuous channel that is
    // smoother on the metal zones); .g masks where specular applies at all. mix(0.15, 1,
    // metallic) keeps fabric sheen modest without a separate parameter (v3 assumption,
    // GUI-calibrated via _Specular). Gated by _UseMetallicGlossMap / _UseSpecRampMap through
    // the hooks.
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let light = hgrp_light_dir();
    let h = normalize(light + view_dir);
    let ndoth = clamp(dot(n, h), 0.0, 1.0);
    let ndotl = clamp(dot(n, light), 0.0, 1.0);

    let mg = hgrp_metallic_gloss(input.uv0);
    // _MetallicGlossMap.r is a zone CODE, not an amount (debug view, 2026-09-03): 1.0 = the
    // hardware — buckles, zips, shoulder plate; ~0.73 = the quilted satin lining; ~0.4 = a
    // small inner-chest patch; 0 = fabric. Only the hardware is metal: it alone loses its
    // diffuse and tints its highlight with the base color (the verified silver look). The
    // lining keeps its diffuse and gets a satin sheen whose strength still follows R.
    let metal = smoothstep(0.85, 0.95, mg.x);
    let sheen_zone = mg.x;
    let gloss = clamp(hgrp_material.spec_smoothness * mg.z, 0.0, 1.0);

    let spec_color = hgrp_spec_ramp_color(ndoth, gloss);
    let shape = pow(ndoth, mix(8.0, 128.0, gloss));
    let spec = spec_color * mix(vec3<f32>(1.0), core.lit, metal) * scene_lighting.light.rgb *
        (shape * smoothstep(0.0, 0.3, ndotl) * hgrp_material.spec_intensity * mg.y *
            mix(0.15, 1.0, sheen_zone));

    let diffuse = core.lit * (1.0 - metal * 0.7);

    let emission = hgrp_emission(input.uv0);

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
        diffuse,
        hgrp_material.pantyhose_color.rgb,
        density * hgrp_material.pantyhose_color.a * hgrp_material.use_pantyhose,
    );

    let sheer = clamp((1.0 - core.alpha) * 2.0, 0.0, 1.0);
    let transmit = (ndotv * ndotv) * (0.4 + 0.6 * ndotl) * sheer *
        hgrp_material.pantyhose_specular_value;
    color += diffuse * (transmit * hgrp_material.use_pantyhose);

    let angle = hgrp_material.pantyhose_aniso_direction * HALF_PI;
    let strand = normalize(
        normalize(input.world_tangent) * cos(angle) +
        normalize(input.world_bitangent) * sin(angle),
    );
    let strand_dot_h = dot(strand, h);
    let sin_th = sqrt(max(0.0, 1.0 - strand_dot_h * strand_dot_h));
    let sheen = pow(sin_th, 16.0) *
        (hgrp_material.pantyhose_specular_int * 1.5 * hgrp_material.use_pantyhose);

    // Opt-in environment reflection on the metallic zones (sceneSettings.envReflection,
    // 0 by default): the ambient hemisphere along the reflected view direction, through the
    // normal-mapped normal — the hypothesis under test is that the quilted metallic lining
    // reads bright in-game because its normal map reflects the surroundings everywhere,
    // where a flat metal plate does not (guess ledger A8).
    let env_spec = hgrp_env(reflect(-view_dir, n)) *
        (sheen_zone * mg.y * scene_lighting.ambient.w);

    return hgrp_debug_view(
        vec4<f32>(color + vec3<f32>(sheen) + spec + emission + hgrp_ambient(core.albedo) + env_spec, core.alpha),
        input.uv0,
    );
}
