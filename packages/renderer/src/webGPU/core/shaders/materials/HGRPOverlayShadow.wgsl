// HGRP/CharacterNPR_OverlayShadow — the shadow shells (the eye-white shadow under the upper
// lid, the hair shadow on the forehead): unlit multiply layers (hgrp-decompiled-formulas.md §5).
// The mask's R channel is the shadow density when _UseGrayAsAlpha is on (the ripped masks are
// 32x32 vertical gradients with G = B = A = 1), otherwise the base alpha; the color is
// _BaseColor, or the base rgb times it. The output is the multiplier the framebuffer is scaled
// by — lerp(1, color, density) under the pipeline's Zero/SrcColor blend — so a zero density is
// the identity. The mask is a lookup strip, sampled clamped as the game does. The stencil gate
// (_ShadowOverIris: 20 = only over eye pixels, 4 = only over the rest of the character) is
// pipeline state, read from the material by the draw list. Group-2 bindings come from the
// permutation's generated fragment (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let base = textureSample(base_map, ramp_sampler, input.uv0);
    let gray_as_alpha = hgrp_overlay_shadow.use_gray_as_alpha;
    let color = mix(base.rgb, vec3<f32>(1.0), gray_as_alpha) * hgrp_overlay_shadow.base_color.rgb;
    let density = mix(base.a, base.r, gray_as_alpha) * hgrp_overlay_shadow.base_color.a;
    return hgrp_debug_view(vec4<f32>(mix(vec3<f32>(1.0), color, density), density), input.uv0);
}
