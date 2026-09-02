// Material debug view, shared by every HGRP shader: turns one texel of the selected slot into
// the color that replaces the shading. The per-permutation generated fragment
// (generated/hgrp_debug_<shaderId>.wgsl) samples the slot — only slots that permutation binds
// exist in it — and calls this with the texel; a material that does not bind the selected slot
// reports `bound = false` and shows magenta. Channel modes follow HGRP_DEBUG_CHANNELS in
// renderer/sceneSettings.ts: 0-3 one channel as grey, 4 raw rgb, 5 the R channel quantized to
// the _MetallicGlossMap plateaus (probed 2026-09-02: 0 / ~0.4 / ~0.73 / 1.0 are distinct
// material zones — grey / green / blue / red; anything between is a filtered edge, yellow).
// The tonemap pass passes the image through untouched while the view is on, so a grey level
// on screen is the stored value (sRGB slots appear darker: they are sampled decoded).

const HGRP_DEBUG_UNBOUND: vec4<f32> = vec4<f32>(0.6, 0.0, 0.6, 1.0);

fn hgrp_debug_color(texel: vec4<f32>, bound: bool, channel: i32) -> vec4<f32> {
    if !bound {
        return HGRP_DEBUG_UNBOUND;
    }
    switch channel {
        case 0: { return vec4<f32>(vec3<f32>(texel.r), 1.0); }
        case 1: { return vec4<f32>(vec3<f32>(texel.g), 1.0); }
        case 2: { return vec4<f32>(vec3<f32>(texel.b), 1.0); }
        case 3: { return vec4<f32>(vec3<f32>(texel.a), 1.0); }
        case 5: {
            let r = texel.r;
            if r < 0.19 { return vec4<f32>(0.15, 0.15, 0.15, 1.0); }
            if abs(r - 0.4) < 0.08 { return vec4<f32>(0.1, 0.8, 0.1, 1.0); }
            if abs(r - 0.73) < 0.08 { return vec4<f32>(0.1, 0.3, 1.0, 1.0); }
            if r > 0.92 { return vec4<f32>(1.0, 0.1, 0.1, 1.0); }
            return vec4<f32>(1.0, 0.9, 0.1, 1.0);
        }
        default: { return vec4<f32>(texel.rgb, 1.0); }
    }
}
