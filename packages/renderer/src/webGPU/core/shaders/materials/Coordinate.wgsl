// Coordinate Shader - Simple coordinate system visualization
 
@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) color: vec4<f32>) -> ColoredVertexOutput {
    var out: ColoredVertexOutput;
    out.clip_position = mvp.mvpMatrix * vec4<f32>(position, 1.0);
    out.color = color;
    return out;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
    return color;
}
