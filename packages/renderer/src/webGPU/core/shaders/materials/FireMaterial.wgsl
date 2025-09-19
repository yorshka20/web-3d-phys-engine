// Fire Material Shader - Flickering fire with distortion and color gradients

// Shader parameters (can be overridden at runtime)
#ifdef ENABLE_FLICKER
override flicker_speed: f32 = 5.0;
override flicker_intensity: f32 = 0.1;
#else
override flicker_speed: f32 = 0.0;
override flicker_intensity: f32 = 0.0;
#endif

#ifdef ENABLE_DISTORTION
override distortion_strength: f32 = 0.1;
#else
override distortion_strength: f32 = 0.0;
#endif

override fire_opacity: f32 = 0.9;

// Vertex shader
@vertex
fn vs_main(input: VertexInput) -> FireVertexOutput {
    var out: FireVertexOutput;
    
    // Add flickering distortion
    let flicker = sin(time_data.time * flicker_speed + input.position.x * 10.0) * flicker_intensity;
    let distorted_pos = input.position + vec3<f32>(flicker, 0.0, 0.0);

    out.position = mvp.mvp_matrix * vec4<f32>(distorted_pos, 1.0);
    out.world_pos = distorted_pos;
    out.normal = input.normal;
    out.uv = input.uv;
    out.flicker = flicker;

    return out;
}

// Fragment shader
@fragment
fn fs_main(input: FireVertexOutput) -> @location(0) vec4<f32> {
    // Debug: Test if fire shader is working
    // return vec4<f32>(1.0, 0.0, 0.0, 1.0); // Red
    
    // Sample fire texture with distortion
    let distorted_uv = input.uv + vec2<f32>(input.flicker * distortion_strength, 0.0);
    let fire_color = textureSample(fire_texture, fire_sampler, distorted_uv);
    
    // Add flickering color variation
    let hue = (time_data.time * 0.5) % 1.0;
    let flicker_color = hsv_to_rgb(vec3<f32>(hue, 0.8, 1.0));
    
    // Mix fire texture with flicker color
    let final_color = mix(fire_color.rgb, flicker_color, 0.3);
    
    // Apply fire opacity
    return vec4<f32>(final_color, fire_opacity);
}
