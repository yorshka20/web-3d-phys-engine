// Fire Material Shader - Flickering fire with distortion and color gradients

// Shader parameters (can be overridden at runtime)
#ifdef ENABLE_FLICKER
override flickerSpeed: f32 = 5.0;
override flickerIntensity: f32 = 0.1;
#else
override flickerSpeed: f32 = 0.0;
override flickerIntensity: f32 = 0.0;
#endif

#ifdef ENABLE_DISTORTION
override distortionStrength: f32 = 0.1;
#else
override distortionStrength: f32 = 0.0;
#endif

override fireOpacity: f32 = 0.9;

// Vertex shader
@vertex
fn vs_main(input: VertexInput) -> FireVertexOutput {
    var out: FireVertexOutput;
    
    // Add flickering distortion
    let flicker = sin(timeData.time * flickerSpeed + input.position.x * 10.0) * flickerIntensity;
    let distortedPos = input.position + vec3<f32>(flicker, 0.0, 0.0);

    out.position = mvp.mvpMatrix * vec4<f32>(distortedPos, 1.0);
    out.worldPos = distortedPos;
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
    let distortedUV = input.uv + vec2<f32>(input.flicker * distortionStrength, 0.0);
    let fireColor = textureSample(fire_texture, fire_sampler, distortedUV);
    
    // Add flickering color variation
    let hue = (timeData.time * 0.5) % 1.0;
    let flickerColor = hsv_to_rgb(vec3<f32>(hue, 0.8, 1.0));
    
    // Mix fire texture with flicker color
    let finalColor = mix(fireColor.rgb, flickerColor, 0.3);
    
    // Apply fire opacity
    return vec4<f32>(finalColor, fireOpacity);
}
