// Fullscreen copy of an LDR texture to the presentation target (BlitPass.ts): the last
// post-process stage that did not itself write the swapchain hands its result over here.

@group(0) @binding(0) var src: texture_2d<f32>;

struct BlitVertexOutput {
    @builtin(position) position: vec4<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> BlitVertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var output: BlitVertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    return output;
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(textureLoad(src, vec2<i32>(position.xy), 0).rgb, 1.0);
}
