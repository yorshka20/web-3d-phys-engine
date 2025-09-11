struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
}

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
}

@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
    out.uv = input.uv;
    return out;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4f {
    let white = vec4f(1.0, 1.0, 1.0, 0.6);
    let gray = vec4f(0.5, 0.5, 0.5, 0.6);

    // Create checkerboard pattern based on UV coordinates
    let grid = vec2u(uv * 8.0);
    let checker = (grid.x + grid.y) % 2 == 1;

    return select(white, gray, checker);
} 