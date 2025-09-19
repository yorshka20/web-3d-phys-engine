// Checkerboard Shader - Simple checkerboard pattern

@vertex
fn vs_main(input: VertexInput) -> SimpleVertexOutput {
    var out: SimpleVertexOutput;
    out.clip_position = mvp.mvp_matrix * vec4<f32>(input.position, 1.0);
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