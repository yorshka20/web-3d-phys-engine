// Water Material Shader - Animated water with wave effects and fresnel reflection

// Shader parameters (can be overridden at runtime)
#ifdef ENABLE_WAVE_ANIMATION
override wave_frequency: f32 = 0.1;
override wave_speed: f32 = 1.0;
override wave_amplitude: f32 = 0.1;
#else
override wave_frequency: f32 = 0.0;
override wave_speed: f32 = 0.0;
override wave_amplitude: f32 = 0.0;
#endif

#ifdef ENABLE_FRESNEL
override fresnel_power: f32 = 2.0;
#else
override fresnel_power: f32 = 0.0;
#endif

override water_opacity: f32 = 0.8;

// Vertex shader
@vertex
fn vs_main(input: VertexInput) -> WaterVertexOutput {
    var out: WaterVertexOutput;
    
    // Add wave animation
    let wave_offset = sin(input.position.x * wave_frequency + time_data.time * wave_speed) * wave_amplitude;
    let world_pos = input.position + vec3<f32>(0.0, wave_offset, 0.0);

    out.position = mvp.mvp_matrix * vec4<f32>(world_pos, 1.0);
    out.world_pos = world_pos;
    out.normal = input.normal;
    out.uv = input.uv;
    out.view_dir = normalize(mvp.camera_pos - world_pos);

    return out;
}

// Fragment shader
@fragment
fn fs_main(input: WaterVertexOutput) -> @location(0) vec4<f32> {
    // Debug: Test if water shader is working
    // return vec4<f32>(0.0, 0.0, 1.0, 1.0); // Blue
    
    // Sample water texture with UV animation
    let animated_uv = input.uv + vec2<f32>(time_data.time * 0.1, time_data.time * 0.05);
    let water_color = textureSample(water_texture, water_sampler, animated_uv);
    
    // Calculate fresnel effect
    let fresnel = calculate_fresnel(input.view_dir, input.normal, fresnel_power);
    
    // Mix water color with fresnel
    let final_color = mix(water_color.rgb, vec3<f32>(0.1, 0.3, 0.8), fresnel);
    
    // Apply water opacity
    return vec4<f32>(final_color, water_opacity);
}
