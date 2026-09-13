// The character's own shadow, sampled from the map CharacterShadowPass rendered from the key
// light. This is the game's `_ScreenSpaceShadowMask.y` term: every variant multiplies its
// lighting ceiling (`ao`) by it, so the shade blend carries the shadow through the same three
// tiers as the n.l shading — hair onto the face, a sleeve onto an arm
// (hgrp-decompiled-formulas.md §1.5 / §1.7 / §2). A character does NOT receive the directional
// shadow in the captured frame (`_CharacterParams1.z = 1`), which is why nothing else reads it.
//
// `geom_n` is the GEOMETRIC normal on purpose: the normal offset walks the lookup off the
// surface it belongs to, and doing that along a normal-mapped normal would move it by the
// texture's detail as well.

fn hgrp_character_shadow(world_position: vec3<f32>, geom_n: vec3<f32>) -> f32 {
    let params = scene_lighting.shadow_params;
    if params.w < 0.5 {
        return 1.0;
    }
    let offset_position = world_position + geom_n * scene_lighting.shadow_params2.x;
    let clip = scene_lighting.light_view_proj * vec4<f32>(offset_position, 1.0);
    let ndc = clip.xyz / clip.w;
    // The light volume covers the casters only: outside it, and behind the far plane, there is
    // nothing between the fragment and the light.
    if ndc.z < 0.0 || ndc.z > 1.0 || any(abs(ndc.xy) > vec2<f32>(1.0)) {
        return 1.0;
    }
    let uv = vec2<f32>(ndc.x, -ndc.y) * 0.5 + vec2<f32>(0.5);
    let reference = ndc.z - params.y;

    // 3x3 PCF. textureSampleCompareLevel, not textureSampleCompare: the explicit level makes it
    // legal in the non-uniform control flow this function is called from.
    var sum = 0.0;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            sum += textureSampleCompareLevel(
                character_shadow_map,
                character_shadow_sampler,
                uv + vec2<f32>(f32(x), f32(y)) * params.x,
                reference,
            );
        }
    }
    return mix(1.0, sum * (1.0 / 9.0), params.z);
}
