// HGRP/CharacterNPR_VFX — the character effect layer (Laevatian's max-potential glow ring).
// Three sampled layers over the same UV: a noise field warps the UVs, a flow texture scrolls
// through that warp to make the moving embers, and a static mask confines the whole thing to
// the mesh's UV island. Colour is HDR (tint x15) and the result is premultiplied by coverage
// — the material asks for One/OneMinusSrcAlpha blending (material/hgrp.ts hgrpBlendMode).
//
// Texture content, probed 2026-09-02 (.claude-learnings/scripts/png-probe.mjs):
//   _DisturbTex1  512^2 smooth noise, mean 127.5 — centred on 0.5, so it reads as a SIGNED
//                 offset; that mean is why the sample is biased by -0.5 rather than used raw.
//   _BlendTex     128^2 sparse bright wisps on near-black — the visible ember pattern.
//   _MaskTex      2048^2 almost entirely black with one narrow band — a UV-space stencil.
// Group-2 bindings come from the permutation's generated fragment (material/hgrp).

fn hgrp_vfx_layer(
    tex: texture_2d<f32>,
    uv0: vec2<f32>,
    speed: vec4<f32>,
    weights: vec4<f32>,
    disturb: vec2<f32>,
    use_disturb: f32,
) -> f32 {
    let uv = uv0 + speed.xy * time_data.time + disturb * use_disturb;
    return dot(textureSample(tex, base_sampler, uv), weights);
}

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    // The noise scrolls on its own and drives every other layer's UV offset
    let disturb_uv = input.uv0 + hgrp_vfx.disturb_uv_speed.xy * time_data.time;
    let disturb_raw = textureSample(disturb_tex1, base_sampler, disturb_uv);
    let signed_noise = dot(disturb_raw, hgrp_vfx.disturb_uv_weights) - 0.5;
    let disturb = signed_noise * hgrp_vfx.disturb_intensity * hgrp_vfx.use_disturb;

    let main_value = hgrp_vfx_layer(
        main_tex,
        input.uv0,
        hgrp_vfx.main_uv_speed,
        hgrp_vfx.main_uv_weights,
        disturb,
        hgrp_vfx.main_use_disturb,
    );
    let blend_value = hgrp_vfx_layer(
        blend_tex,
        input.uv0,
        hgrp_vfx.blend_uv_speed,
        hgrp_vfx.blend_uv_weights,
        disturb,
        hgrp_vfx.blend_use_disturb,
    );
    let mask_value = hgrp_vfx_layer(
        mask_tex,
        input.uv0,
        hgrp_vfx.mask_uv_speed,
        hgrp_vfx.mask_uv_weights,
        disturb,
        hgrp_vfx.mask_use_disturb,
    );

    // Coverage: the mask is the shape, the main layer an optional extra alpha source. Both
    // gates are on for Laevatian, whose _MainTex slot is empty — the white default leaves
    // main_value at 1, so the mask alone decides the shape.
    var coverage = hgrp_vfx.tint_color.a * hgrp_vfx.tint_alpha;
    coverage *= mix(1.0, main_value, hgrp_vfx.use_main_as_alpha);
    coverage *= mix(1.0, mask_value, hgrp_vfx.use_mask * hgrp_vfx.use_mask_as_alpha);
    coverage = clamp(coverage, 0.0, 1.0);

    // The crimson tint is the base glow; the flow layer adds warm embers over it (v1 reading
    // of _UseBlend — the compositing operator did not survive the rip, but _BlendTint being
    // HDR and the flow texture being sparse wisps only makes sense as an additive layer).
    let base = hgrp_vfx.tint_color.rgb * hgrp_vfx.tint_intensity;
    let embers = blend_value * hgrp_vfx.blend_tint.rgb * hgrp_vfx.use_blend;

    return vec4<f32>((base + embers) * coverage, coverage);
}
