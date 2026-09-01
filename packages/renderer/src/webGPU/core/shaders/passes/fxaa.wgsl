// FXAA (Lottes 3.11, compact quality variant) over the ENCODED LDR tonemap output —
// FXAA's luma heuristics are designed for the perceptual domain, so it runs after the
// sRGB encode and its output goes to the swapchain's plain (non-sRGB) view untouched.
// Standalone source, imported directly by FXAAPass.ts.

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var src_sampler: sampler;

struct FXAAVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> FXAAVertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var output: FXAAVertexOutput;
    let pos = positions[vertex_index];
    output.position = vec4<f32>(pos, 0.0, 1.0);
    output.uv = vec2<f32>(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
    return output;
}

const FXAA_REDUCE_MIN: f32 = 1.0 / 128.0;
const FXAA_REDUCE_MUL: f32 = 1.0 / 8.0;
const FXAA_SPAN_MAX: f32 = 8.0;

fn luma(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(input: FXAAVertexOutput) -> @location(0) vec4<f32> {
    let texel = 1.0 / vec2<f32>(textureDimensions(src));
    let uv = input.uv;

    let rgb_nw = textureSample(src, src_sampler, uv + vec2<f32>(-1.0, -1.0) * texel).rgb;
    let rgb_ne = textureSample(src, src_sampler, uv + vec2<f32>(1.0, -1.0) * texel).rgb;
    let rgb_sw = textureSample(src, src_sampler, uv + vec2<f32>(-1.0, 1.0) * texel).rgb;
    let rgb_se = textureSample(src, src_sampler, uv + vec2<f32>(1.0, 1.0) * texel).rgb;
    let rgb_m = textureSample(src, src_sampler, uv).rgb;

    let luma_nw = luma(rgb_nw);
    let luma_ne = luma(rgb_ne);
    let luma_sw = luma(rgb_sw);
    let luma_se = luma(rgb_se);
    let luma_m = luma(rgb_m);
    let luma_min = min(luma_m, min(min(luma_nw, luma_ne), min(luma_sw, luma_se)));
    let luma_max = max(luma_m, max(max(luma_nw, luma_ne), max(luma_sw, luma_se)));

    var dir = vec2<f32>(
        -((luma_nw + luma_ne) - (luma_sw + luma_se)),
        (luma_nw + luma_sw) - (luma_ne + luma_se),
    );
    let dir_reduce = max(
        (luma_nw + luma_ne + luma_sw + luma_se) * 0.25 * FXAA_REDUCE_MUL,
        FXAA_REDUCE_MIN,
    );
    let rcp_dir_min = 1.0 / (min(abs(dir.x), abs(dir.y)) + dir_reduce);
    dir = clamp(
        dir * rcp_dir_min,
        vec2<f32>(-FXAA_SPAN_MAX),
        vec2<f32>(FXAA_SPAN_MAX),
    ) * texel;

    let rgb_a = 0.5 *
        (textureSample(src, src_sampler, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
            textureSample(src, src_sampler, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
    let rgb_b = rgb_a * 0.5 + 0.25 *
        (textureSample(src, src_sampler, uv + dir * -0.5).rgb +
            textureSample(src, src_sampler, uv + dir * 0.5).rgb);
    let luma_b = luma(rgb_b);

    if luma_b < luma_min || luma_b > luma_max {
        return vec4<f32>(rgb_a, 1.0);
    }
    return vec4<f32>(rgb_b, 1.0);
}
