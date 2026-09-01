// Fullscreen tonemap resolve: HDR scene-color (rgba16float, linear light) -> swapchain.
//
// exposure x ACES (Narkowicz 2015 fitted curve): linear HDR rolls off to display-referred
// [0,1]. The render target is the swapchain's sRGB VIEW, so the shader outputs linear
// display values and the hardware performs the sRGB encode — no manual pow here. The game's
// exact grading curve is unknown (calibration item); ACES is the neutral filmic baseline.

@group(0) @binding(0) var scene_color: texture_2d<f32>;

struct TonemapSettings {
    exposure: f32,
    reserved1: f32,
    reserved2: f32,
    reserved3: f32,
}
@group(0) @binding(1) var<uniform> tonemap_settings: TonemapSettings;

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

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let hdr = textureLoad(scene_color, vec2<i32>(position.xy), 0).rgb;
    return vec4<f32>(aces_tonemap(hdr * tonemap_settings.exposure), 1.0);
}
