// Tonemap resolve: HDR scene-color (rgba16float, linear light) + bloom -> LDR.
//
// (scene + bloom x intensity) x exposure -> the game's ACES_MODIFIED curve -> manual sRGB
// encode. The output target is a plain rgba8unorm LDR texture holding ENCODED values: the
// FXAA pass that follows expects perceptual-domain input and passes encoded values through to
// the swapchain untouched — hence the explicit encode here instead of an sRGB view.
//
// The curve is transcribed from the decompiled LUT builder (postprocessing/lutbuilder2d,
// keyword TONEMAPPING_ACES_MODIFIED; hgrp-decompiled-formulas.md §12.3): the scene color goes
// to ACEScg (AP1), a rational fit of the ACES RRT+ODT is applied per channel, the result comes
// back to linear sRGB desaturated by 7% about the AP1 luma, and bright pixels are pulled toward
// their max-normalized color — a colored highlight keeps its hue instead of bleaching, a
// neutral one goes to white. Middle grey 0.18 lands at 0.10 display-linear (the standard ACES
// look), a third of what the Narkowicz fit gave; the lighting levels are calibrated against
// this curve. Of the game's grading stages (color filter, white balance, ACEScc contrast,
// split toning, curves, HSV) only the color filter is reproduced, in its own position ahead of
// the curve; the rest sit at identity by default, and `grade` below stands in for them.

@group(0) @binding(0) var scene_color: texture_2d<f32>;

struct TonemapSettings {
    exposure: f32,
    bloom_intensity: f32,
    contrast: f32,
    saturation: f32,
    // rgb = the color filter, a linear multiplier in AP1 ahead of the curve — the position the
    // game grades in (lutbuilder2d multiplies _ColorGradingCB_ColorFilter right after AP0->AP1,
    // before every other grading stage). Ahead of the curve it moves the mid-tones and still
    // lets a bright pixel bleach toward white, which a gain applied after the curve cannot do.
    // w = 1 while the material debug view is on: the scene color is then stored values, passed
    // through untouched (no bloom, no curve, no encode) so a grey level reads as the texel value
    color_filter: vec4<f32>,
}
@group(0) @binding(1) var<uniform> tonemap_settings: TonemapSettings;
@group(0) @binding(2) var bloom_tex: texture_2d<f32>;
@group(0) @binding(3) var bloom_sampler: sampler;

struct TonemapVertexOutput {
    @builtin(position) position: vec4<f32>,
}

// Single fullscreen triangle (covers the viewport, no vertex buffer needed)
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> TonemapVertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var output: TonemapVertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    return output;
}

// Linear sRGB (D65) <-> ACEScg (AP1, D60 via Bradford), the pair the LUT builder composes
// from its sRGB -> AP0 and AP0 -> AP1 matrices. Column-major constructors: each vec3 is a
// column, so the rows read across the three.
const SRGB_TO_AP1: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(0.6130974, 0.0701937, 0.0206156),
    vec3<f32>(0.3395231, 0.9163539, 0.1095698),
    vec3<f32>(0.0473795, 0.0134524, 0.8698146),
);
const AP1_TO_SRGB: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(1.7050515, -0.1302571, -0.0240033),
    vec3<f32>(-0.6217907, 1.1408029, -0.1289688),
    vec3<f32>(-0.0832587, -0.0105482, 1.1529716),
);
// Luminance weights of AP1
const AP1_LUMA: vec3<f32> = vec3<f32>(0.2722290, 0.6740820, 0.0536895);

// The RRT+ODT fit of the LUT builder, per channel in AP1: x (2.785 x + 0.108) / (x (2.936 x
// + 0.887) + 0.807), capped at 1.
fn aces_modified_curve(x: vec3<f32>) -> vec3<f32> {
    let denominator = clamp(
        vec3<f32>(1.0) / (x * (x * 2.9360449 + 0.8871220) + 0.8068890),
        vec3<f32>(1e-4),
        vec3<f32>(1e4),
    );
    return clamp(x * (x * 2.7850850 + 0.1077720) * denominator, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Linear sRGB scene color -> linear sRGB display color.
fn aces_modified_tonemap(color: vec3<f32>) -> vec3<f32> {
    let ap1 = max(SRGB_TO_AP1 * color * tonemap_settings.color_filter.rgb, vec3<f32>(0.0));
    let toned = aces_modified_curve(ap1);
    let display = AP1_TO_SRGB * mix(vec3<f32>(dot(toned, AP1_LUMA)), toned, 0.93);
    // Bright pixels (pre-curve AP1 luma from 0.5 up to 2) blend toward their max-normalized
    // color: hue preserved, the brightest channel at 1.
    let normalized = clamp(display / max(max(display.r, max(display.g, display.b)), 1e-5), vec3<f32>(0.0), vec3<f32>(1.0));
    let bright = clamp((dot(ap1, AP1_LUMA) - 0.5) * 0.6666667, 0.0, 1.0);
    return clamp(mix(display, normalized, bright), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn srgb_encode(x: vec3<f32>) -> vec3<f32> {
    let lo = x * 12.92;
    let hi = 1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(hi, lo, x <= vec3<f32>(0.0031308));
}

// Grading in the encoded domain (after the curve): saturation about luma, contrast about
// mid grey. Identity at (1, 1). Hue lives in the color filter ahead of the curve instead.
fn grade(encoded: vec3<f32>) -> vec3<f32> {
    let luma = dot(encoded, vec3<f32>(0.2126, 0.7152, 0.0722));
    var c = mix(vec3<f32>(luma), encoded, tonemap_settings.saturation);
    c = (c - vec3<f32>(0.5)) * tonemap_settings.contrast + vec3<f32>(0.5);
    return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let hdr = textureLoad(scene_color, vec2<i32>(position.xy), 0).rgb;
    if tonemap_settings.color_filter.w > 0.5 {
        return vec4<f32>(clamp(hdr, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
    }
    let uv = position.xy / vec2<f32>(textureDimensions(scene_color));
    let bloom = textureSample(bloom_tex, bloom_sampler, uv).rgb;
    let color = (hdr + bloom * tonemap_settings.bloom_intensity) * tonemap_settings.exposure;
    return vec4<f32>(grade(srgb_encode(aces_modified_tonemap(color))), 1.0);
}
