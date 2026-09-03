// Checkerboard Shader - Simple checkerboard pattern

@vertex
fn vs_main(input: VertexInput) -> StandardVertexOutput {
    var out: StandardVertexOutput;
    out.clip_position = mvp.mvp_matrix * vec4<f32>(input.position, 1.0);
    out.world_position = (mvp.model_matrix * vec4<f32>(input.position, 1.0)).xyz;
    out.world_normal = (mvp.normal_matrix * vec4<f32>(input.normal, 0.0)).xyz;
    out.uv = input.uv;
    return out;
}

@fragment
fn fs_main(in: StandardVertexOutput) -> @location(0) vec4f {
    let white = vec4f(1.0, 1.0, 1.0, 0.6);
    let gray = vec4f(0.5, 0.5, 0.5, 0.6);

    // Cells are measured in world units, not UV: a ground plane's UV always spans 0..1, so a
    // UV-based grid changes cell size whenever the plane is resized.
    let cell = max(shader_params.cellSize, 0.001);
    let grid = vec2<i32>(floor(in.world_position.xz / cell));

    // WGSL's % truncates toward zero, so a negative sum yields -1; testing against 0 keeps the
    // pattern symmetric across the origin instead of doubling one row and column.
    let checker = (grid.x + grid.y) % 2 != 0;

    return select(white, gray, checker);
}
