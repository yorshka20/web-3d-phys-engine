// Tonemap resolve: HDR scene-color (rgba16float, linear light) + bloom -> LDR.
//
// (scene + bloom x intensity) x exposure -> ACES (Narkowicz 2015 fitted curve) -> manual
// sRGB encode. The output target is a plain rgba8unorm LDR texture holding ENCODED values:
// the FXAA pass that follows expects perceptual-domain input and passes encoded values
// through to the swapchain untouched — hence the explicit encode here instead of an sRGB
// view. The game's exact grading curve is unknown (calibration item); ACES is the neutral
// filmic baseline.

@group(0) @binding(0) var scene_color: texture_2d<f32>;

struct TonemapSettings {
    exposure: f32,
    bloom_intensity: f32,
    contrast: f32,
    saturation: f32,
    // x = temperature (-1 cool .. 1 warm)
    grading: vec4<f32>,
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

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn srgb_encode(x: vec3<f32>) -> vec3<f32> {
    let lo = x * 12.92;
    let hi = 1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(hi, lo, x <= vec3<f32>(0.0031308));
}

// Grading in the encoded domain (after the curve): saturation about luma, contrast about
// mid grey, temperature as opposing red/blue gain. Identity at (1, 1, 0).
fn grade(encoded: vec3<f32>) -> vec3<f32> {
    let luma = dot(encoded, vec3<f32>(0.2126, 0.7152, 0.0722));
    var c = mix(vec3<f32>(luma), encoded, tonemap_settings.saturation);
    c = (c - vec3<f32>(0.5)) * tonemap_settings.contrast + vec3<f32>(0.5);
    let temperature = tonemap_settings.grading.x;
    c *= vec3<f32>(1.0 + temperature * 0.1, 1.0, 1.0 - temperature * 0.1);
    return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let hdr = textureLoad(scene_color, vec2<i32>(position.xy), 0).rgb;
    let uv = position.xy / vec2<f32>(textureDimensions(scene_color));
    let bloom = textureSample(bloom_tex, bloom_sampler, uv).rgb;
    let color = (hdr + bloom * tonemap_settings.bloom_intensity) * tonemap_settings.exposure;
    return vec4<f32>(grade(srgb_encode(aces_tonemap(color))), 1.0);
}
