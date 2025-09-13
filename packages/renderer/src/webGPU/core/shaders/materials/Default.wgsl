struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
    cameraPos: vec3<f32>,
    padding: f32,
}

struct TimeUniforms {
    time: f32,
    deltaTime: f32,
    frameCount: u32,
    padding: u32,
}

@group(0) @binding(0) var<uniform> timeData: TimeUniforms;
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
    out.uv = input.uv;
    return out;
}

@fragment
fn fs_main(input: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    // Fixed: Use UV coordinates as color instead of non-existent input.color
    output.color = vec4<f32>(input.uv, 0.0, 1.0);

    return output;
}