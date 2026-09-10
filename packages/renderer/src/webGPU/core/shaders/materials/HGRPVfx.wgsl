// HGRP/CharacterNPR_VFX — the character effect layer: energy sheets, trails and glow parts
// rigged into a character (jsspsi's wings and tail fin, Laevatian's max-potential ring).
// Transcribed from the game's `characternpr_vfx` ForwardOnly fragment (dump variants b329
// blend+disturb+mask+screenUV and b333 disturb+fresnel+mask+softBlend; every material feature
// is a Unity keyword there and a uniform toggle here, so one module covers the permutations):
//
//   uv(layer)  = rotate(uv0·w.x + uv1·w.y + screen·w.w + speed·t − ½) + ½, then × ST.xy + ST.zw,
//                plus the noise offset × the layer's UseDisturb
//   disturb    = noise texture: plain (r·(bi+1) − bi) × (U, V) intensity, or as a normal map
//                ((a·r, g) × 2 − 1) × U intensity
//   base       = tint × (I, I, I, A) × main' × mask'      (a layer read AsAlpha is (1, 1, 1, .r))
//   blend      = blendTex × sat((base.a + blendTex.a) × blendTint.a) × blendTint, added to base
//   fresnel    = f = pow(sat(V·N + bias), power), fres = lerp(1 − f, f, flip):
//                rgb → lerp(rgb, fresnelColor, fresnelColor.a × fres); α × lerp(1, fres, affect)
//   α          = sat(base.a) × fresnel × nearFade × soft, soft = sat((sceneDepth − depth + bias) / dist)
//   out        = (rgb × α, α × (1 − BlendMode)) under One / OneMinusSrcAlpha — alpha blend at
//                BlendMode 0, additive at 1
//
// Left out on purpose: the scene fog terms (this stage has no fog), the LOD cross-fade dither,
// the motion-vector target, and the particle custom data (the zw speeds and the InParticle UV1
// swap: these are mesh renderers). Vertex color is 1: none of the export's effect meshes carries
// authored colors, and the glb's COLOR_0 is the outline's averaged normal, not a color.
// "Ignore post exposure" divides by the scene exposure that the post pass multiplies back.
// Group-2 bindings come from the permutation's generated fragment (material/hgrp).

fn hgrp_vfx_rotate(uv: vec2<f32>, m: vec4<f32>) -> vec2<f32> {
    // HLSL mul(row vector, float2x2(m.xy, m.zw)) about the UV centre
    let c = uv - vec2<f32>(0.5);
    return vec2<f32>(c.x * m.x + c.y * m.z, c.x * m.y + c.y * m.w) + vec2<f32>(0.5);
}

fn hgrp_vfx_uv(
    uv0: vec2<f32>,
    uv1: vec2<f32>,
    screen_uv: vec2<f32>,
    weights: vec4<f32>,
    speed: vec4<f32>,
    rotate: vec4<f32>,
    st: vec4<f32>,
) -> vec2<f32> {
    let uv = uv0 * weights.x + uv1 * weights.y + screen_uv * weights.w + speed.xy * time_data.time;
    return hgrp_vfx_rotate(uv, rotate) * st.xy + st.zw;
}

// View-space depth (metres in front of the camera) of a stored depth value, for the standard
// 0..1 perspective projection the renderer uses: clip.z = a·z + b, clip.w = −z.
fn hgrp_vfx_view_depth(depth: f32) -> f32 {
    let a = mvp.projection_matrix[2][2];
    let b = mvp.projection_matrix[3][2];
    return b / (depth + a);
}

// The screen-space UV set (weights.w): pixel position as −1..1 with the aspect folded into v,
// or the view-space offset to the object's origin (LocalPivortSpace), optionally the world y
// as v, scaled by the origin's view depth past the near plane so the pattern keeps its size
// as the camera moves (ScreenUVUseDepth).
fn hgrp_vfx_screen_uv(frag_position: vec4<f32>, world_position: vec3<f32>) -> vec2<f32> {
    let screen_size = vec2<f32>(textureDimensions(scene_depth));
    let ndc = frag_position.xy / screen_size * 2.0 - vec2<f32>(1.0);
    let origin = mvp.model_matrix * vec4<f32>(0.0, 0.0, 0.0, 1.0);
    let view_offset = (mvp.view_matrix * vec4<f32>(world_position - origin.xyz, 0.0)).xy;
    var uv = mix(
        vec2<f32>(ndc.x, ndc.y * screen_size.y / screen_size.x),
        view_offset,
        hgrp_vfx.local_pivot_space,
    );
    uv.y = mix(uv.y, world_position.y, hgrp_vfx.pos_y_as_screen_v);
    let near = mvp.projection_matrix[3][2] / mvp.projection_matrix[2][2];
    let origin_depth = -(mvp.view_matrix * origin).z;
    let depth_scale = mix(1.0, max(1.0, origin_depth - near), hgrp_vfx.screen_uv_use_depth);
    return uv * depth_scale;
}

@fragment
fn fs_main(
    input: GLTFVertexOutput,
    @builtin(front_facing) front_facing: bool,
) -> @location(0) vec4<f32> {
    let screen_uv = hgrp_vfx_screen_uv(input.position, input.world_position);

    // The noise field, sampled on its own UV set and read either as a scalar offset or as a
    // normal map's xy (the export packs x in alpha, y in green)
    let disturb_uv = hgrp_vfx_uv(
        input.uv0, input.uv1, screen_uv,
        hgrp_vfx.disturb_uv_weights, hgrp_vfx.disturb_uv_speed,
        hgrp_vfx.disturb_uv_rotate, hgrp_vfx.disturb_st,
    );
    let noise = textureSample(disturb_tex1, base_sampler, disturb_uv);
    let signed = noise.r * (hgrp_vfx.bi_disturb + 1.0) - hgrp_vfx.bi_disturb;
    let plain_offset = vec2<f32>(signed * hgrp_vfx.disturb_intensity.x, signed * hgrp_vfx.disturb_intensity.y);
    let normal_offset = (vec2<f32>(noise.a * signed, noise.g) * 2.0 - vec2<f32>(1.0)) * hgrp_vfx.disturb_intensity.x;
    let disturb = mix(plain_offset, normal_offset, hgrp_vfx.disturb_is_normal) * hgrp_vfx.use_disturb;

    let main_uv = hgrp_vfx_uv(
        input.uv0, input.uv1, screen_uv,
        hgrp_vfx.main_uv_weights, hgrp_vfx.main_uv_speed,
        hgrp_vfx.main_uv_rotate, hgrp_vfx.main_st,
    ) + disturb * hgrp_vfx.main_use_disturb;
    let mask_uv = hgrp_vfx_uv(
        input.uv0, input.uv1, screen_uv,
        hgrp_vfx.mask_uv_weights, hgrp_vfx.mask_uv_speed,
        hgrp_vfx.mask_uv_rotate, hgrp_vfx.mask_st,
    ) + disturb * hgrp_vfx.mask_use_disturb;
    let blend_uv = hgrp_vfx_uv(
        input.uv0, input.uv1, screen_uv,
        hgrp_vfx.blend_uv_weights, hgrp_vfx.blend_uv_speed,
        hgrp_vfx.blend_uv_rotate, hgrp_vfx.blend_st,
    ) + disturb * hgrp_vfx.blend_use_disturb;

    let main_sample = textureSample(main_tex, base_sampler, main_uv);
    let mask_sample = textureSample(mask_tex, base_sampler, mask_uv);
    let blend_sample = textureSample(blend_tex, base_sampler, blend_uv);

    let tint = hgrp_vfx.tint_color
        * vec4<f32>(hgrp_vfx.tint_intensity, hgrp_vfx.tint_intensity, hgrp_vfx.tint_intensity, hgrp_vfx.tint_alpha);
    let main_layer = mix(main_sample, vec4<f32>(1.0, 1.0, 1.0, main_sample.r), hgrp_vfx.use_main_as_alpha);
    let mask_read = mix(mask_sample, vec4<f32>(1.0, 1.0, 1.0, mask_sample.r), hgrp_vfx.use_mask_as_alpha);
    let mask_layer = mix(vec4<f32>(1.0), mask_read, hgrp_vfx.use_mask);
    let base = tint * main_layer * mask_layer;

    let blend_coverage = clamp((base.a + blend_sample.a) * hgrp_vfx.blend_tint.a, 0.0, 1.0);
    let blend_layer = blend_sample.rgb * blend_coverage * hgrp_vfx.blend_tint.rgb * hgrp_vfx.use_blend;
    var rgb = base.rgb + blend_layer;

    // Fresnel: the geometric normal faces the camera on both sides of a two-sided sheet
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let facing_normal = normalize(input.world_normal) * select(-1.0, 1.0, front_facing);
    let f = pow(clamp(dot(view_dir, facing_normal) + hgrp_vfx.fresnel_bias, 0.0, 1.0), hgrp_vfx.fresnel_power);
    let fres = mix(1.0 - f, f, hgrp_vfx.fresnel_flip);
    rgb = mix(rgb, hgrp_vfx.fresnel_color.rgb, hgrp_vfx.fresnel_color.a * fres * hgrp_vfx.use_fresnel);
    let fresnel_opacity = mix(1.0, mix(1.0, fres, hgrp_vfx.fresnel_affect_opacity), hgrp_vfx.use_fresnel);

    let exposure_scale = mix(1.0, 1.0 / max(scene_lighting.env_stand_in.z, 1e-3), hgrp_vfx.ignore_post_exposure);
    rgb = clamp(rgb * exposure_scale, vec3<f32>(0.0), vec3<f32>(1000.0));

    // Opacity: the near-camera fade over view depth, and the soft fade where the sheet meets
    // the opaque scene (the depth prepass, cleared to the far plane where nothing was drawn)
    let view_depth = -(mvp.view_matrix * vec4<f32>(input.world_position, 1.0)).z;
    let fade = hgrp_vfx.near_fade;
    let near_fade = mix(
        1.0,
        clamp((view_depth - fade.x) / (fade.y - fade.x), 0.0, 1.0)
            * clamp((view_depth - fade.z) / (fade.w - fade.z), 0.0, 1.0),
        hgrp_vfx.use_near_fade,
    );
    let scene_depth_sample = textureLoad(scene_depth, vec2<i32>(input.position.xy), 0);
    let soft = mix(
        1.0,
        clamp((hgrp_vfx_view_depth(scene_depth_sample) - view_depth + hgrp_vfx.soft_bias) / hgrp_vfx.soft_distance, 0.0, 1.0),
        hgrp_vfx.use_soft_blend,
    );
    let alpha = clamp(clamp(base.a, 0.0, 1.0) * fresnel_opacity * near_fade * soft, 0.0, 1.0);

    return hgrp_debug_view(vec4<f32>(rgb * alpha, alpha * (1.0 - hgrp_vfx.blend_mode)), input.uv0);
}
