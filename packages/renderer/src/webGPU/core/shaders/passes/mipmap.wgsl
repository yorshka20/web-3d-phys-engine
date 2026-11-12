// One mip level of a 2D texture from the level above it (TextureManager.generateMipmaps):
// a fullscreen triangle sampling the finer level with a linear clamp sampler at the coarser
// level's texel centres — a 2x2 box for even sizes, the matching tent for odd ones. WebGPU has
// no generateMipmap; this is the render-pass form of it, which also handles sRGB formats
// correctly because the source view decodes and the target view re-encodes, so the average is
// taken in linear light.

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var src_sampler: sampler;

struct MipVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> MipVertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var output: MipVertexOutput;
    let p = positions[vertex_index];
    output.position = vec4<f32>(p, 0.0, 1.0);
    output.uv = p * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
    return output;
}

@fragment
fn fs_main(input: MipVertexOutput) -> @location(0) vec4<f32> {
    return textureSample(src, src_sampler, input.uv);
}
