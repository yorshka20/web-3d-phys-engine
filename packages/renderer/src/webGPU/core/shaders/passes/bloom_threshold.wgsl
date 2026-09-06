// The game's bloom threshold (HGRP/PostProcessing/Bloom prefilter and the uberpost composite
// share it; hgrp-decompiled-formulas.md §15): the color is scaled, not clipped, by how far its
// brightest channel sits above the threshold, with a quadratic knee below it. The vec4 is the
// game's _BloomThreshold packing (threshold, threshold - knee, 2 knee, 0.25 / knee), built by
// packBloomThreshold in BloomPass.ts. Prepended to the bloom and tonemap pass sources by their
// passes — the fixed post-process shaders are standalone strings, outside the include system.
fn bloom_threshold(color: vec3<f32>, t: vec4<f32>) -> vec3<f32> {
    let brightness = max(max(color.r, color.g), color.b);
    let soft = clamp(brightness - t.y, 0.0, t.z);
    return color * (max(t.w * soft * soft, brightness - t.x) / max(brightness, 1e-4));
}
