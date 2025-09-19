 
@vertex
fn vs_main(input: VertexInput) -> ColoredVertexOutputWithNormal {
    var out: ColoredVertexOutputWithNormal;
    let t = time_data.time;

    out.clip_position = mvp.mvp_matrix * vec4<f32>(input.position, 1.0);
    out.normal = input.normal;
    out.uv = input.uv;
    out.color = vec4<f32>(t, 1.0 - t, sin(t * 1.0), 1.0);
    return out;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let t = time_data.time;

    let pulse = sin(t * 2.0) * 0.2 + 0.8;  // more stable pulse

    let hue = (t * 0.5) % 1.0;
    let animated_color = hsv_to_rgb(vec3<f32>(hue, 0.8, 1.0));  // slightly lower saturation

    return vec4<f32>(animated_color * pulse, color.w);
}

 