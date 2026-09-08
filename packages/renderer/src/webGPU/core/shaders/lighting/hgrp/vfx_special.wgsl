// Character VFX layer (_EnableCharacterVFX, the standard shader's _CHARACTER_VFX_SPECIAL
// keyword; hgrp-decompiled-formulas.md §6.1, transcribed from characternpr b404): an HDR flow
// layer the shading core adds to the lit color ahead of the IBL, like the emission. The blend
// map, read at the material's UV set scrolled by _VFXSpecialParam.zw x time, gives in R the
// dissolve threshold and the warp of the main map's UV, and as RGBA the tinted flow; the main
// map, read at the warped UV scrolled by .xy x time, is the pattern (or, as alpha, the
// coverage). A fresnel term either tints the layer toward _VFXFresnelColor or fades it, and the
// schedule offset moves the dissolve edge through the blend map. The scroll clock is the engine
// global _VFXParams0.w, taken here as seconds (guess ledger M3). Off-stub: nothing added.
fn hgrp_vfx_special(
    uv0: vec2<f32>,
    uv1: vec2<f32>,
    world_normal: vec3<f32>,
    shading_normal: vec3<f32>,
    view_dir: vec3<f32>,
) -> vec3<f32> {
    let t = time_data.time;
    // UV set 0 = uv0, 1 = the mesh's second set; the polar and screen modes (2, 3) are not
    // reproduced and read uv0.
    let uv_set = hgrp_material.vfx_main_uv_set;
    let uv = select(mix(uv0, uv1, uv_set), uv0, uv_set > 1.5);

    let blend_st = hgrp_material.vfx_blend_tex_st;
    let blend = textureSample(
        vfx_special_blend_tex,
        base_sampler,
        (uv + hgrp_material.vfx_special_param.zw * t) * blend_st.xy + blend_st.zw,
    );
    let disturb = blend.r;
    let main_st = hgrp_material.vfx_main_tex_st;
    let main_uv =
        (uv + vec2<f32>(hgrp_material.vfx_blend_r_disturb * disturb) + hgrp_material.vfx_special_param.xy * t) * main_st.xy +
        main_st.zw;
    let main_tex = textureSample(vfx_special_main_tex, base_sampler, main_uv);

    let tint = vec4<f32>(hgrp_material.vfx_color.rgb * hgrp_material.vfx_color_intensity, hgrp_material.vfx_color.a * hgrp_material.vfx_color_alpha);
    let main = tint * mix(main_tex, vec4<f32>(1.0, 1.0, 1.0, main_tex.r), hgrp_material.vfx_main_tex_as_alpha);
    let coverage = main.a;

    // Dissolve: the blend map R against the schedule threshold; below it the layer is gone and
    // its edge takes the fresnel color.
    let edge = disturb - (hgrp_material.vfx_dissolve_offset * 2.02 - 1.01);
    let dissolved = clamp(-edge, 0.0, 1.0);

    let n = select(shading_normal, world_normal, hgrp_material.vfx_fresnel_use_normal_map < 0.5);
    let facing = pow(clamp(dot(view_dir, n) + hgrp_material.vfx_fresnel_bias, 0.0, 1.0), hgrp_material.vfx_fresnel_power);
    let fresnel = mix(1.0 - facing, facing, hgrp_material.vfx_fresnel_flip);

    let flow = blend * clamp((coverage + blend.a) * hgrp_material.vfx_blend_tint.a, 0.0, 1.0) * hgrp_material.vfx_blend_tint;
    let color = mix(
        mix((flow + main).rgb, hgrp_material.vfx_fresnel_color.rgb * dissolved * hgrp_material.vfx_color_intensity, dissolved),
        hgrp_material.vfx_fresnel_color.rgb,
        hgrp_material.vfx_fresnel_color.a * fresnel,
    );
    let opacity = clamp(coverage * clamp(edge, 0.0, 1.0), 0.0, 1.0) *
        ((1.0 - hgrp_material.vfx_fresnel_affect_opacity) + fresnel * hgrp_material.vfx_fresnel_affect_opacity);
    return color * opacity;
}
