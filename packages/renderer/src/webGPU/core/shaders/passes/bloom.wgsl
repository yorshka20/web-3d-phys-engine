// The game's bloom chain (HGRP/PostProcessing/Bloom, decompiled postprocessing/bloom/bloom/*;
// hgrp-decompiled-formulas.md §15) — URP's Bloom with a character branch in the prefilter.
// Linear-light HDR, ahead of the tonemap. Prefilter: full-res scene -> half-res mip 0, the
// scene exposed first (the game's forward pass stores pre-exposed color, so its thresholds
// see exposed values), five rotated taps thresholded (bloom_threshold.wgsl, prepended) and
// averaged with Karis weights
// 1 / (1 + luma) against fireflies; a pixel the character stencil groups stamped takes the
// character path instead: a per-channel subtraction of the character threshold, scaled by the
// character intensity. Downsample, per level: a 9-tap Gaussian at twice the source texel
// stride (the halving step) into a scratch level, then a 5-tap bilinear Gaussian at the
// level's own size. Upsample: each level is mix(high, low, scatter) — a blend, not an
// accumulation — and mip 0 of the up chain is what the tonemap composites.
// Standalone source (imported directly by BloomPass.ts, same rule as tonemap.wgsl).

// The source of the step: the scene color (prefilter), the finer level (blur H), the level
// itself (blur V), the coarser level (upsample).
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var src_sampler: sampler;

struct BloomParams {
    // _BloomThreshold packing: (threshold, threshold - knee, 2 knee, 0.25 / knee)
    threshold: vec4<f32>,
    // The same packing for character pixels (_BloomCharacterThreshold); only .x is read
    character_threshold: vec4<f32>,
    // x = character bloom intensity (_BloomCharacterParams.x), y = scatter (_Params.x),
    // z = exposure (sceneSettings.exposure, the pre-exposure of the stored scene color)
    scalars: vec4<f32>,
}
@group(0) @binding(2) var<uniform> params: BloomParams;
// Prefilter only: the forward pass's stencil aspect. The HGRP stencil groups stamp every
// opaque character draw (material/hgrp hgrpStencilRole) and nothing else writes stencil, so
// non-zero means character — the game flags the same pixels through its motion-vector
// target's w (0.4 for characters; §15).
@group(0) @binding(3) var character_mask: texture_2d<u32>;
// Upsample only: the finer level the coarser one is blended toward
@group(0) @binding(4) var src_high: texture_2d<f32>;

const LUMA: vec3<f32> = vec3<f32>(0.2126729, 0.7151522, 0.0721750);

struct BloomVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Single fullscreen triangle; uv spans [0,1] over the viewport
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> BloomVertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var output: BloomVertexOutput;
    let pos = positions[vertex_index];
    output.position = vec4<f32>(pos, 0.0, 1.0);
    output.uv = vec2<f32>(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
    return output;
}

fn sample_src(uv: vec2<f32>) -> vec3<f32> {
    return textureSampleLevel(src, src_sampler, uv, 0.0).rgb;
}

// One thresholded tap of the prefilter, on the scene or the character path of its pixel
fn prefilter_tap(uv: vec2<f32>) -> vec3<f32> {
    let color = sample_src(uv) * params.scalars.z;
    let dims = vec2<i32>(textureDimensions(character_mask));
    let texel = clamp(vec2<i32>(uv * vec2<f32>(dims)), vec2<i32>(0), dims - vec2<i32>(1));
    let is_character = textureLoad(character_mask, texel, 0).r != 0u;
    let scene = bloom_threshold(color, params.threshold);
    let character = max(color - vec3<f32>(params.character_threshold.x), vec3<f32>(0.0)) * params.scalars.x;
    return select(scene, character, is_character);
}

// Five taps on a rotated grid one scene texel out, Karis-weighted so a single very bright
// texel cannot dominate its neighbours
@fragment
fn fs_prefilter(input: BloomVertexOutput) -> @location(0) vec4<f32> {
    let texel = 1.0 / vec2<f32>(textureDimensions(src));
    var offsets = array<vec2<f32>, 5>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(0.9, -0.4),
        vec2<f32>(-0.9, 0.4),
        vec2<f32>(0.4, 0.9),
        vec2<f32>(-0.4, -0.9),
    );
    var sum = vec3<f32>(0.0);
    var weight_sum = 0.0;
    for (var i = 0; i < 5; i++) {
        let tap = prefilter_tap(input.uv + offsets[i] * texel);
        let weight = 1.0 / (dot(tap, LUMA) + 1.0);
        sum += tap * weight;
        weight_sum += weight;
    }
    return vec4<f32>(sum / weight_sum, 1.0);
}

// 9-tap Gaussian, horizontal, at twice the source texel stride: the source is the finer level,
// so this is the halving step
@fragment
fn fs_blur_h(input: BloomVertexOutput) -> @location(0) vec4<f32> {
    let stride = vec2<f32>(2.0 / f32(textureDimensions(src).x), 0.0);
    var c = sample_src(input.uv) * 0.22702703;
    c += (sample_src(input.uv - stride) + sample_src(input.uv + stride)) * 0.19459459;
    c += (sample_src(input.uv - stride * 2.0) + sample_src(input.uv + stride * 2.0)) * 0.12162162;
    c += (sample_src(input.uv - stride * 3.0) + sample_src(input.uv + stride * 3.0)) * 0.05405405;
    c += (sample_src(input.uv - stride * 4.0) + sample_src(input.uv + stride * 4.0)) * 0.01621622;
    return vec4<f32>(c, 1.0);
}

// The same 9-tap Gaussian, vertical, as 5 bilinear taps at the level's own size
@fragment
fn fs_blur_v(input: BloomVertexOutput) -> @location(0) vec4<f32> {
    let texel_y = 1.0 / f32(textureDimensions(src).y);
    let near = vec2<f32>(0.0, texel_y * 1.38461538);
    let far = vec2<f32>(0.0, texel_y * 3.23076923);
    var c = sample_src(input.uv) * 0.22702703;
    c += (sample_src(input.uv - near) + sample_src(input.uv + near)) * 0.31621622;
    c += (sample_src(input.uv - far) + sample_src(input.uv + far)) * 0.07027027;
    return vec4<f32>(c, 1.0);
}

// The coarser level (src, bilinear) blended over the finer one (src_high) by scatter
@fragment
fn fs_upsample(input: BloomVertexOutput) -> @location(0) vec4<f32> {
    let high = textureSampleLevel(src_high, src_sampler, input.uv, 0.0).rgb;
    let low = sample_src(input.uv);
    return vec4<f32>(mix(high, low, params.scalars.y), 1.0);
}
