// HGRP/CharacterNPR_Skin (face + body): normal-mapped ramp shadow blend; the shadow color
// comes from the skin color-grading LUT (_ShadowLutTex) when _UseShadowLutTex is set, else
// from the HSV adjustment. When _UseSDFLightmap is set (face), the ramp coordinate is the
// SDF face-shadow factor instead of half-Lambert n.l, so the ramp's warm terminator lands
// exactly on the SDF boundary. _SDFMask/highlight/emotion layer on later. Binding indices
// must match the HGRP_TEXTURE_SLOTS_BY_VARIANT slot order in HGRPMaterialResources.ts.

@group(2) @binding(5) var bump_map: texture_2d<f32>; // _BumpMap
@group(2) @binding(6) var shadow_lut: texture_2d<f32>; // _ShadowLutTex
@group(2) @binding(7) var sdf_lightmap: texture_2d<f32>; // _SDFLightmap

// SDF face shadow v1 (channel semantics still under calibration — see hgrp-shading.md):
// R holds the light-yaw threshold field for one side; the other side samples mirrored UVs.
// Head axes come from the model matrix (bind pose is static until skeletal animation).
fn hgrp_sdf_shade_coord(uv0: vec2<f32>) -> f32 {
    let head_forward = normalize((mvp.model_matrix * vec4<f32>(0.0, 0.0, 1.0, 0.0)).xyz);
    let head_right = normalize((mvp.model_matrix * vec4<f32>(1.0, 0.0, 0.0, 0.0)).xyz);
    let light = normalize(MAIN_LIGHT_DIRECTION);

    let lx = dot(light, head_right);
    let lz = dot(light, head_forward);
    // 0 = light dead ahead, 1 = light directly behind (horizontal sweep only)
    let threshold = atan2(abs(lx), lz) / PI;

    let uv_sdf = select(vec2<f32>(1.0 - uv0.x, uv0.y), uv0, lx >= 0.0);
    let sdf = textureSample(sdf_lightmap, ramp_sampler, uv_sdf).r;

    return smoothstep(threshold - 0.05, threshold + 0.05, sdf);
}

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let base = hgrp_base_color(input.uv0);
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
    let ndotl = dot(n, normalize(MAIN_LIGHT_DIRECTION));

    let hsv_shadow = hgrp_hsv_shadow_color(
        base.rgb,
        hgrp_material.shadow_color_brightness,
        hgrp_material.shadow_color_saturation,
    );
    let lut_shadow = hgrp_sample_shadow_lut(shadow_lut, ramp_sampler, base.rgb);
    let shadow_color = select(hsv_shadow, lut_shadow, hgrp_material.use_shadow_lut > 0.5);

    let sdf_coord = hgrp_sdf_shade_coord(input.uv0);
    let shade_coord = select(
        ndotl * 0.5 + 0.5,
        sdf_coord,
        hgrp_material.use_sdf_lightmap > 0.5,
    );
    let w = hgrp_shadow_weight(shade_coord, hgrp_material.use_diff_ramp);

    let rim = hgrp_rim(n, input.position, ndotl);

    return vec4<f32>(mix(shadow_color, base.rgb, w) + rim, base.a);
}
