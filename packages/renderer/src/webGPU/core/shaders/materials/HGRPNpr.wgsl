// HGRP/CharacterNPR (cloth / general): normal-mapped shade blend under the NPR lighting
// multiplier (lighting/hgrp_npr.wgsl), a GGX specular colored by the spec ramp, the split-sum
// IBL that gives the metal zones their reflected environment, HDR emission (rolls off
// through the tonemap shoulder), and on tights the silk-stockings coverage and anisotropic
// lobe (lighting/hgrp_silk_stockings.wgsl). The surface map (_MetallicGlossMap) supplies
// metallic, specular amount, occlusion and smoothness; without it the material's scalars
// stand in. Group-2 bindings and the subsystem hooks come from the permutation's generated
// fragments (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let ndotv = clamp(dot(n, view_dir), 0.0, 1.0);
    let surface = hgrp_metallic_gloss(input.uv0);

    // The silk coverage rewrites the albedo and the shadow color as a pair before the shade
    // blend (formulas §1.12); with _Pantyhose off it is the identity.
    var inputs = hgrp_shade_inputs(input.uv0, n, view_dir);
    let silk = hgrp_silk_coverage(inputs.albedo, inputs.shadow_color, inputs.base.a, ndotv);
    inputs.albedo = silk.albedo;
    inputs.shadow_color = silk.shadow_color;
    let core = hgrp_shade_lit(inputs, n, scene_lighting.env_color.rgb, surface);

    // Specular (formulas §1.9): F0 = lerp(0.04 x specular amount, albedo, metallic), colored
    // by the spec ramp read at the normalized GGX lobe and roughness x (1 - metallic). The GGX
    // term and the silk lobe share that color, the shadow-side attenuation and light(N).
    let metallic = surface.r;
    let roughness = 1.0 - surface.a;
    let alpha = hgrp_ggx_alpha(roughness);
    let h = hgrp_half_vector(view_dir);
    let d = hgrp_ggx_d(dot(n, h), alpha);
    let f0 = mix(vec3<f32>(0.04 * surface.g), core.albedo, metallic);
    let rs = hgrp_spec_ramp_color(d * (alpha * alpha + 1e-4), roughness * (1.0 - metallic));
    let handedness = hgrp_tangent_handedness(
        normalize(input.world_normal),
        input.world_tangent,
        input.world_bitangent,
    );
    let silk_lobe = hgrp_silk_spec_term(
        n,
        input.world_tangent,
        handedness,
        view_dir,
        h,
        alpha,
        inputs.base.a,
        silk.sheer,
    );
    let spec = f0 * rs *
        ((hgrp_spec_term(d, alpha, ndotv) + silk_lobe) * hgrp_shade_spec(core.w2)) * core.light;

    let emission = hgrp_emission(input.uv0);

    // Environment reflection (formulas §1.10) for every material through its F0: on the
    // silver hardware (metallic 1) it is the whole look, since a metal has no diffuse.
    let ibl = hgrp_ibl(f0, roughness, ndotv, n, view_dir, core.w2, scene_lighting.env_color.rgb);

    return hgrp_debug_view(
        vec4<f32>(hgrp_bright_saturation(core.lit + spec) + emission + ibl, core.alpha),
        input.uv0,
    );
}
