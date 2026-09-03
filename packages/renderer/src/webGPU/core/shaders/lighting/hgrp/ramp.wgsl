// Diffuse ramp subsystem (_UseDiffRampMap): the 256x1 _DiffRampMap, indexed by a signed shade
// value in [-1, 1] — n.l with the ramp bias for the light ramp, n.camDir for the view ramp —
// mapped to [0, 1]. The ALPHA is the lit weight (every ripped ramp's alpha rises monotonically
// 0 -> 1, hgrp-decompiled-formulas.md §1.5); the rgb is a tint the shading core applies
// luminance-preserving (§1.7). Off-stub: the game's rampless fallback, smoothstep(0.25, 1, s)
// in every channel (cloth variant b360).
fn hgrp_ramp(shade: f32) -> vec4<f32> {
    return textureSample(
        diff_ramp_map,
        ramp_sampler,
        vec2<f32>(hgrp_ramp_inset(shade * 0.5 + 0.5), 0.5),
    );
}
