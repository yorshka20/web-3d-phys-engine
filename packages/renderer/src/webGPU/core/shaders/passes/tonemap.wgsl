// Fullscreen tonemap resolve: HDR scene-color (rgba16float) -> swapchain.
//
// The curve is identity below the shoulder and a rational soft-shoulder above it, so the
// calibrated SDR look is preserved while HDR overshoot (rim / spec / emission) rolls off
// smoothly instead of hard-clipping. The full linear-light + filmic curve pipeline is the
// material-calibration session's scope — shading currently works in display-referred space
// (see learnings hgrp-shading.md, "sRGB passthrough").

@group(0) @binding(0) var scene_color: texture_2d<f32>;

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

const SHOULDER_START: f32 = 0.8;

fn soft_clip(x: f32) -> f32 {
    if x <= SHOULDER_START {
        return x;
    }
    let range = 1.0 - SHOULDER_START;
    let overshoot = x - SHOULDER_START;
    // Rational shoulder: monotonic, C1-continuous at the knee, asymptote at 1.0
    return SHOULDER_START + range * (overshoot / (overshoot + range));
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let hdr = textureLoad(scene_color, vec2<i32>(position.xy), 0);
    return vec4<f32>(soft_clip(hdr.r), soft_clip(hdr.g), soft_clip(hdr.b), 1.0);
}
