
 
// Vertex shader for full geometry (pos+normal+uv)
@vertex
fn vs_main(input: VertexInput) -> ColoredVertexOutputWithNormal {
    var out: ColoredVertexOutputWithNormal;
    out.clip_position = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
        
    // Use normal for better lighting/coloring
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let lightAmount = max(dot(input.normal, lightDir), 0.2);
    out.color = vec4<f32>(input.normal * 0.5 + 0.5, 1.0) * lightAmount;

    out.normal = input.normal;
    out.uv = input.uv;
    return out;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let t = timeData.time;

    let pulse = sin(t * 2.0) * 0.2 + 0.8;  // more stable pulse

    let hue = (t * 0.5) % 1.0;
    let animatedColor = hsv_to_rgb(vec3<f32>(hue, 0.8, 1.0));  // slightly lower saturation

    let dist = length(color.xy - vec2<f32>(0.5));
    let wave = sin(dist * 10.0 - t * 5.0) * 0.25 + 0.75;  // brighter wave
        
    // add ambient light and brightness
    let ambient = 0.15;
    let brightness = 1.0;

    let finalColor = (color.xyz * wave + ambient) * brightness;

    return vec4<f32>(finalColor, color.w);
}
