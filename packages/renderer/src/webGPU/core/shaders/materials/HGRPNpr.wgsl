// HGRP/CharacterNPR (cloth / general): ramp shadow blend on the geometric normal with HSV
// (or LUT) shadow color, spec-ramp highlights on the normal-mapped surface, HDR emission
// (rolls off through the tonemap shoulder), and the hemisphere ambient split the PBR way —
// diffuse ambient on the non-metal albedo, ambient specular on the reflected direction
// weighted by a Schlick fresnel with F0 = metallic (the quilted silver lining reads as satin
// under ambient alone, where its key-light highlight cannot reach). Group-2 bindings and the
// subsystem hooks come from the permutation's generated fragments (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let n_geom = normalize(input.world_normal);
    let core = hgrp_shade_core(input.uv0, n_geom, n, input.position);

    // Spec v3 (reference-screenshot driven): the RS stays a specular COLOR lookup (raw
    // addition whitewashes — v1 lesson). _MetallicGlossMap.r holds discrete METALLIC zones:
    // metal has no diffuse, so the shaded base is suppressed there. The spec color is the RS
    // alone (v3 tinted it by the shaded albedo, which dimmed silver painted mid-grey in the
    // base map to nothing — the RS is the game's specular color source); .a is per-texel SMOOTHNESS
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
    let metallic = mg.x;
    let gloss = clamp(hgrp_material.spec_smoothness * mg.z, 0.0, 1.0);

    let spec_color = hgrp_spec_ramp_color(ndoth, gloss);
    let shape = pow(ndoth, mix(8.0, 128.0, gloss));
    let spec = spec_color * scene_lighting.light.rgb *
        (shape * smoothstep(0.0, 0.3, ndotl) * hgrp_material.spec_intensity * mg.y *
            mix(0.15, 1.0, metallic));

    let diffuse = core.lit * (1.0 - metallic * 0.7);

    // Ambient: hemisphere diffuse on the dielectric share of the albedo, plus the hemisphere
    // reflected off the normal-mapped surface, weighted by Schlick fresnel with F0 rising
    // from 0.04 to 1 with metallic and the grazing term scaled by gloss (rough fabric keeps
    // no edge sheen). Masked like the key-light specular.
    let ndotv = clamp(dot(n, view_dir), 0.0, 1.0);
    let f0 = vec3<f32>(mix(0.04, 1.0, metallic));
    let fresnel = f0 + (vec3<f32>(1.0) - f0) * (pow(1.0 - ndotv, 5.0) * gloss);
    let ambient = hgrp_ambient(core.albedo, n_geom) * (1.0 - metallic) +
        hgrp_hemisphere(reflect(-view_dir, n)) * fresnel * mg.y;

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

    return vec4<f32>(color + vec3<f32>(sheen) + spec + emission + ambient, core.alpha);
}
