// Bloom mip-chain shaders (linear-light HDR domain, before tonemap): prefilter extracts
// over-threshold energy from the scene color into mip 0 (half res), downsample walks the
// chain to the smallest mip, upsample tent-filters each level back up with ADDITIVE
// blending (pipeline blend state), accumulating the widening glow in mip 0 — which the
// tonemap pass composites. Standalone source (imported directly by BloomPass.ts, same rule
// as tonemap.wgsl).

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var src_sampler: sampler;

struct BloomParams {
    threshold: f32, // HDR luminance where extraction starts
    reserved1: f32,
    reserved2: f32,
    reserved3: f32,
}
@group(0) @binding(2) var<uniform> params: BloomParams;

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

// Luma-scaled soft extraction: keeps hue (scales the color instead of clipping channels)
@fragment
fn fs_prefilter(input: BloomVertexOutput) -> @location(0) vec4<f32> {
    let c = textureSample(src, src_sampler, input.uv).rgb;
    let l = max(max(c.r, c.g), c.b);
    let contribution = max(l - params.threshold, 0.0) / max(l, 0.0001);
    return vec4<f32>(c * contribution, 1.0);
}

// 4-tap box via bilinear half-texel offsets
@fragment
fn fs_downsample(input: BloomVertexOutput) -> @location(0) vec4<f32> {
    let texel = 1.0 / vec2<f32>(textureDimensions(src));
    let o = texel * 0.5;
    let c = textureSample(src, src_sampler, input.uv + vec2<f32>(-o.x, -o.y)).rgb +
        textureSample(src, src_sampler, input.uv + vec2<f32>(o.x, -o.y)).rgb +
        textureSample(src, src_sampler, input.uv + vec2<f32>(-o.x, o.y)).rgb +
        textureSample(src, src_sampler, input.uv + vec2<f32>(o.x, o.y)).rgb;
    return vec4<f32>(c * 0.25, 1.0);
}

// 9-tap tent (blended additively into the destination mip by the pipeline)
@fragment
fn fs_upsample(input: BloomVertexOutput) -> @location(0) vec4<f32> {
    let texel = 1.0 / vec2<f32>(textureDimensions(src));
    var c = textureSample(src, src_sampler, input.uv).rgb * 4.0;
    c += textureSample(src, src_sampler, input.uv + vec2<f32>(texel.x, 0.0)).rgb * 2.0;
    c += textureSample(src, src_sampler, input.uv - vec2<f32>(texel.x, 0.0)).rgb * 2.0;
    c += textureSample(src, src_sampler, input.uv + vec2<f32>(0.0, texel.y)).rgb * 2.0;
    c += textureSample(src, src_sampler, input.uv - vec2<f32>(0.0, texel.y)).rgb * 2.0;
    c += textureSample(src, src_sampler, input.uv + texel).rgb;
    c += textureSample(src, src_sampler, input.uv - texel).rgb;
    c += textureSample(src, src_sampler, input.uv + vec2<f32>(texel.x, -texel.y)).rgb;
    c += textureSample(src, src_sampler, input.uv + vec2<f32>(-texel.x, texel.y)).rgb;
    return vec4<f32>(c / 16.0, 1.0);
}
