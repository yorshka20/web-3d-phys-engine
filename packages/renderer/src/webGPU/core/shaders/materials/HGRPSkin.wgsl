// HGRP/CharacterNPR_Skin (face + body): normal-mapped shade blend under the NPR lighting
// multiplier, with the skin shader's own environment color (_CharacterParams3) read through
// the horizontal normal (formulas §2); the shadow color comes from the skin color-grading LUT
// (_UseShadowLutTex) when that subsystem is on, else from the luminance/saturation adjustment.
// With the SDF subsystem on (face), the shade value is the SDF face-shadow factor instead of
// the biased n.l and _SDFRimColor tints the albedo at grazing view (lighting/hgrp/sdf.wgsl).
// The specular slot holds a GGX lobe gated by the SDF mask plus the nose highlight; emission
// layers on top. The emotion atlas is still to come. Group-2 bindings and the subsystem hooks
// come from the permutation's generated fragments (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    // No surface map on skin: the hook's off-stub yields the material's scalars
    let surface = hgrp_metallic_gloss(input.uv0);
    let core = hgrp_shade_core(
        input.uv0,
        n,
        hgrp_horizontal(n),
        scene_lighting.env_color.rgb,
        surface,
        view_dir,
    );

    // Specular slot (formulas §2): F0 = lerp(0.04 x _Specular x SDF mask G, albedo, _Metallic),
    // no spec ramp; the nose highlight is added into the same slot so it is lit like a highlight.
    let roughness = 1.0 - surface.a;
    let alpha = hgrp_ggx_alpha(roughness);
    let h = hgrp_half_vector(view_dir);
    let d = hgrp_ggx_d(dot(n, h), alpha);
    let ndotv = clamp(dot(n, view_dir), 0.0, 1.0);
    let f0 = mix(vec3<f32>(0.04 * surface.g * core.spec_gate), core.albedo, surface.r);
    let highlight = hgrp_face_highlight(input.uv0, view_dir);
    let spec = (f0 * hgrp_spec_term(d, alpha, ndotv) + highlight) *
        (hgrp_shade_spec(core.w2)) * core.light;

    let emission = hgrp_emission(input.uv0);

    return hgrp_debug_view(
        vec4<f32>(hgrp_bright_saturation(core.lit + spec) + emission, core.alpha),
        input.uv0,
    );
}
