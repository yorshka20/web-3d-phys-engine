// Debug view pass: one of the frame's intermediate textures visualised in place of the
// picture (renderer/passes/DebugViewPass.ts; learnings renderer-debug-views.md). Every mode is
// a fullscreen read of textures the production passes already produce, so no production
// shader carries a debug branch — the material slot view is a separate generated permutation
// whose raw output the 'material' mode presents. Writes encoded values straight to the
// swapchain like the blit, bypassing the anti-aliasing stages. Standalone source (imported
// directly by DebugViewPass.ts, same rule as tonemap.wgsl).

// HDR forward output (linear light, textureLoad)
@group(0) @binding(0) var scene_color: texture_2d<f32>;
// One level of the bloom chain, smaller than the output, sampled
@group(0) @binding(1) var bloom_level: texture_2d<f32>;
@group(0) @binding(2) var bloom_sampler: sampler;
// Stencil aspect of the forward depth-stencil: the HGRP stencil groups
@group(0) @binding(3) var stencil_tex: texture_2d<u32>;
// This frame's tonemap output (encoded LDR) and the frame the diff view holds
@group(0) @binding(4) var ldr_tex: texture_2d<f32>;
@group(0) @binding(5) var held_frame: texture_2d<f32>;

struct DebugViewSettings {
    // x = mode (MODE_*), y = exposure, z = gain of the diff view
    params: vec4<f32>,
    // _BloomThreshold packings of the scene and the character path; only .x is read
    threshold: vec4<f32>,
    character_threshold: vec4<f32>,
}
@group(0) @binding(6) var<uniform> settings: DebugViewSettings;

const MODE_MATERIAL: f32 = 1.0;
const MODE_BLOOM: f32 = 2.0;
const MODE_LUMINANCE: f32 = 3.0;
const MODE_STENCIL: f32 = 4.0;
const MODE_DIFF: f32 = 5.0;

const LUMA: vec3<f32> = vec3<f32>(0.2126729, 0.7151522, 0.0721750);

struct DebugVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Single fullscreen triangle; uv spans [0,1] over the viewport
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> DebugVertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var output: DebugVertexOutput;
    let pos = positions[vertex_index];
    output.position = vec4<f32>(pos, 0.0, 1.0);
    output.uv = vec2<f32>(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
    return output;
}

fn srgb_encode(x: vec3<f32>) -> vec3<f32> {
    let lo = x * 12.92;
    let hi = 1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(hi, lo, x <= vec3<f32>(0.0031308));
}

// The scene color as the bloom prefilter and the tonemap see it: exposed
fn exposed(coord: vec2<i32>) -> vec3<f32> {
    return textureLoad(scene_color, coord, 0).rgb * settings.params.y;
}

// Whether the bloom prefilter extracts this pixel: brightest channel over the threshold of
// its path (the character threshold where the stencil groups stamped, the scene's elsewhere)
fn over_bloom_threshold(coord: vec2<i32>) -> bool {
    let c = exposed(coord);
    let is_character = textureLoad(stencil_tex, coord, 0).r != 0u;
    let threshold = select(settings.threshold.x, settings.character_threshold.x, is_character);
    return max(max(c.r, c.g), c.b) > threshold;
}

// Exposed luminance on a log2 ramp over 1/16 .. 16, one colour per factor of four:
// dark blue 0.0625, blue 0.25, green 1, yellow 4, red 16
fn heat(luminance: f32) -> vec3<f32> {
    let t = clamp((log2(max(luminance, 1e-6)) + 4.0) / 8.0, 0.0, 1.0) * 4.0;
    let dark_blue = vec3<f32>(0.0, 0.0, 0.25);
    let blue = vec3<f32>(0.0, 0.4, 1.0);
    let green = vec3<f32>(0.0, 1.0, 0.0);
    let yellow = vec3<f32>(1.0, 1.0, 0.0);
    let red = vec3<f32>(1.0, 0.0, 0.0);
    if t < 1.0 {
        return mix(dark_blue, blue, t);
    } else if t < 2.0 {
        return mix(blue, green, t - 1.0);
    } else if t < 3.0 {
        return mix(green, yellow, t - 2.0);
    }
    return mix(yellow, red, clamp(t - 3.0, 0.0, 1.0));
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> vec3<f32> {
    let k = fract(vec3<f32>(h) + vec3<f32>(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0;
    let p = clamp(abs(k - 3.0) - 1.0, vec3<f32>(0.0), vec3<f32>(1.0));
    return v * mix(vec3<f32>(1.0), p, s);
}

@fragment
fn fs_main(input: DebugVertexOutput) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(input.position.xy);
    let mode = settings.params.x;

    if mode == MODE_MATERIAL {
        // The debug permutation wrote texel values; present them as they are
        let stored = textureLoad(scene_color, coord, 0).rgb;
        return vec4<f32>(clamp(stored, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
    }
    if mode == MODE_BLOOM {
        // The glow as the composite receives it: exposed linear, clamped — emissive halos
        // saturate, faint glow reads at its true level
        let glow = textureSample(bloom_level, bloom_sampler, input.uv).rgb;
        return vec4<f32>(srgb_encode(clamp(glow, vec3<f32>(0.0), vec3<f32>(1.0))), 1.0);
    }
    if mode == MODE_LUMINANCE {
        // Heat ramp of the exposed luminance, with a white contour where the bloom threshold
        // is crossed: everything inside a contour blooms
        let dims = vec2<i32>(textureDimensions(scene_color));
        let over = over_bloom_threshold(coord);
        let edge = over && !(
            over_bloom_threshold(clamp(coord + vec2<i32>(1, 0), vec2<i32>(0), dims - 1)) &&
            over_bloom_threshold(clamp(coord - vec2<i32>(1, 0), vec2<i32>(0), dims - 1)) &&
            over_bloom_threshold(clamp(coord + vec2<i32>(0, 1), vec2<i32>(0), dims - 1)) &&
            over_bloom_threshold(clamp(coord - vec2<i32>(0, 1), vec2<i32>(0), dims - 1))
        );
        let ramp = heat(dot(exposed(coord), LUMA));
        return vec4<f32>(select(ramp, vec3<f32>(1.0), edge), 1.0);
    }
    if mode == MODE_STENCIL {
        // One hue per stencil value (golden-ratio spacing keeps neighbouring values apart),
        // black where nothing stamped
        let stencil = textureLoad(stencil_tex, coord, 0).r;
        if stencil == 0u {
            return vec4<f32>(0.0, 0.0, 0.0, 1.0);
        }
        return vec4<f32>(hsv_to_rgb(fract(f32(stencil) * 0.618034), 0.75, 1.0), 1.0);
    }
    // MODE_DIFF: this frame against the held one, around mid grey — flat grey where nothing
    // changed, lighter where a knob brightened the picture, darker where it darkened it,
    // tinted where it shifted the colour
    let current = textureLoad(ldr_tex, coord, 0).rgb;
    let held = textureLoad(held_frame, coord, 0).rgb;
    let diff = (current - held) * settings.params.z;
    return vec4<f32>(clamp(vec3<f32>(0.5) + diff, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
