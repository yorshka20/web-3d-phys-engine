// Water Material Shader - Animated water with wave effects and fresnel reflection

// Shader parameters (can be overridden at runtime)
#ifdef ENABLE_WAVE_ANIMATION
override waveFrequency: f32 = 0.1;
override waveSpeed: f32 = 1.0;
override waveAmplitude: f32 = 0.1;
#else
override waveFrequency: f32 = 0.0;
override waveSpeed: f32 = 0.0;
override waveAmplitude: f32 = 0.0;
#endif

#ifdef ENABLE_FRESNEL
override fresnelPower: f32 = 2.0;
#else
override fresnelPower: f32 = 0.0;
#endif

override waterOpacity: f32 = 0.8;

// Vertex shader
@vertex
fn vs_main(input: VertexInput) -> WaterVertexOutput {
    var out: WaterVertexOutput;
    
    // Add wave animation
    let waveOffset = sin(input.position.x * waveFrequency + timeData.time * waveSpeed) * waveAmplitude;
    let worldPos = input.position + vec3<f32>(0.0, waveOffset, 0.0);

    out.position = mvp.mvpMatrix * vec4<f32>(worldPos, 1.0);
    out.worldPos = worldPos;
    out.normal = input.normal;
    out.uv = input.uv;
    out.viewDir = normalize(mvp.cameraPos - worldPos);

    return out;
}

// Fragment shader
@fragment
fn fs_main(input: WaterVertexOutput) -> @location(0) vec4<f32> {
    // Debug: Test if water shader is working
    // return vec4<f32>(0.0, 0.0, 1.0, 1.0); // Blue
    
    // Sample water texture with UV animation
    let animatedUV = input.uv + vec2<f32>(timeData.time * 0.1, timeData.time * 0.05);
    let waterColor = textureSample(water_texture, water_sampler, animatedUV);
    
    // Calculate fresnel effect
    let fresnel = calculate_fresnel(input.viewDir, input.normal, fresnelPower);
    
    // Mix water color with fresnel
    let finalColor = mix(waterColor.rgb, vec3<f32>(0.1, 0.3, 0.8), fresnel);
    
    // Apply water opacity
    return vec4<f32>(finalColor, waterOpacity);
}
