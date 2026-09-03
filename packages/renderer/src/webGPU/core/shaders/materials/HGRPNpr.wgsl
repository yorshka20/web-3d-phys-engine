// HGRP/CharacterNPR (cloth / general): normal-mapped shade blend under the NPR lighting
// multiplier (lighting/hgrp_npr.wgsl), a GGX specular colored by the spec ramp, the split-sum
// IBL that gives the metal zones their reflected environment, and HDR emission (rolls off
// through the tonemap shoulder). The surface map (_MetallicGlossMap) supplies metallic,
// specular amount, occlusion and smoothness; without it the material's scalars stand in.
// Group-2 bindings and the subsystem hooks come from the permutation's generated fragments
// (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let surface = hgrp_metallic_gloss(input.uv0);
    let core = hgrp_shade_core(
        input.uv0,
        n,
        n,
        scene_lighting.env_color.rgb,
        surface,
        view_dir,
    );

    // Specular (formulas §1.9): F0 = lerp(0.04 x specular amount, albedo, metallic), colored
    // by the spec ramp read at the normalized GGX lobe and roughness x (1 - metallic), scaled
    // by the GGX term, the shadow-side attenuation and light(N).
    let metallic = surface.r;
    let roughness = 1.0 - surface.a;
    let alpha = hgrp_ggx_alpha(roughness);
    let h = hgrp_half_vector(view_dir);
    let d = hgrp_ggx_d(dot(n, h), alpha);
    let ndotv = clamp(dot(n, view_dir), 0.0, 1.0);
    let f0 = mix(vec3<f32>(0.04 * surface.g), core.albedo, metallic);
    let rs = hgrp_spec_ramp_color(d * (alpha * alpha + 1e-4), roughness * (1.0 - metallic));
    let spec = f0 * rs * (hgrp_spec_term(d, alpha, ndotv) * hgrp_shade_spec(core.w2)) *
        core.light;

    let emission = hgrp_emission(input.uv0);

    // Pantyhose v2 (_Pantyhose, tights on cloth_04). Grounded in the base texture (probed
    // 2026-09-01): the tights region's RGB is the pre-mixed warm skin-through tone and its
    // ALPHA (~0.52, kept just above the clip threshold) is the authored fabric-density map —
    // so sheerness derives from (1 - base alpha). Facing the viewer the fabric thins out and
    // the lit through-tone glows (transmit, scaled by _PantyhoseSpecularValue); edge-on the
    // layers stack up and densify toward _PantyhoseColor (its alpha = layer weight). The
    // silky sheen is a Kajiya-Kay lobe along the tangent rotated by
    // _PantyhoseAnisotropyDirection (-1..1 read as quarter turns, v1 assumption — the
    // formula did not survive the rip). The decompiled silk-stockings formula (formulas
    // §1.12) replaces this block.
    let ndotl = clamp(dot(n, hgrp_light_dir()), 0.0, 1.0);
    let density = pow(1.0 - ndotv, 2.0);
    var color = mix(
        core.lit,
        hgrp_material.pantyhose_color.rgb,
        density * hgrp_material.pantyhose_color.a * hgrp_material.use_pantyhose,
    );

    let sheer = clamp((1.0 - core.alpha) * 2.0, 0.0, 1.0);
    let transmit = (ndotv * ndotv) * (0.4 + 0.6 * ndotl) * sheer *
        hgrp_material.pantyhose_specular_value;
    color += core.lit * (transmit * hgrp_material.use_pantyhose);

    let angle = hgrp_material.pantyhose_aniso_direction * HALF_PI;
    let strand = normalize(
        normalize(input.world_tangent) * cos(angle) +
        normalize(input.world_bitangent) * sin(angle),
    );
    let strand_dot_h = dot(strand, h);
    let sin_th = sqrt(max(0.0, 1.0 - strand_dot_h * strand_dot_h));
    let sheen = pow(sin_th, 16.0) *
        (hgrp_material.pantyhose_specular_int * 1.5 * hgrp_material.use_pantyhose);

    // Environment reflection (formulas §1.10) for every material through its F0: on the
    // silver hardware (metallic 1) it is the whole look, since a metal has no diffuse.
    let ibl = hgrp_ibl(f0, roughness, ndotv, n, view_dir, core.w2, scene_lighting.env_color.rgb);

    return hgrp_debug_view(
        vec4<f32>(
            hgrp_bright_saturation(color + vec3<f32>(sheen) + spec) + emission + ibl,
            core.alpha,
        ),
        input.uv0,
    );
}
