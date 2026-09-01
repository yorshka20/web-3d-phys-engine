// HGRP/CharacterNPR_Eye (brow + iris): ramp shadow blend; the brow uses the skin LUT
// (_UseShadowLutTex), the iris the HSV adjustment. Matcap (_MatcapTex) layers on here. The
// iris only becomes visible through the Stage D pre-Z / stencil compositing
// (_PreZStencilRefOption) — grey eyes are expected until then. Binding index must match the
// HGRP_TEXTURE_SLOTS_BY_VARIANT slot order in HGRPMaterialResources.ts.

@group(2) @binding(6) var shadow_lut: texture_2d<f32>; // _ShadowLutTex

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let base = hgrp_base_color(input.uv0);
    let n = normalize(input.world_normal);
    let ndotl = dot(n, normalize(MAIN_LIGHT_DIRECTION));

    let hsv_shadow = hgrp_hsv_shadow_color(
        base.rgb,
        hgrp_material.shadow_color_brightness,
        hgrp_material.shadow_color_saturation,
    );
    let lut_shadow = hgrp_sample_shadow_lut(shadow_lut, ramp_sampler, base.rgb);
    let shadow_color = select(hsv_shadow, lut_shadow, hgrp_material.use_shadow_lut > 0.5);

    let w = hgrp_shadow_weight(ndotl * 0.5 + 0.5, hgrp_material.use_diff_ramp);

    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let rim = hgrp_rim(n, view_dir, ndotl);

    return vec4<f32>(mix(shadow_color, base.rgb, w) + rim, base.a);
}
