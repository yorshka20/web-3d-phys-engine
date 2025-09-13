// Shadow mapping pass definitions
// This file contains structures and functions for shadow mapping

// Shadow map vertex output
struct ShadowVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) depth: f32,
}

// Shadow map uniforms
struct ShadowUniforms {
    lightMatrix: mat4x4<f32>,
    lightPosition: vec3<f32>,
    lightRadius: f32,
    bias: f32,
}

// Shadow map bindings
@group(2) @binding(0) var<uniform> shadowData: ShadowUniforms;
@group(2) @binding(1) var shadowMap: texture_depth_2d;
@group(2) @binding(2) var shadowSampler: sampler_comparison;

// Transform vertex for shadow mapping
fn shadow_vertex_transform(position: vec3<f32>) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;

    let shadow_pos = shadowData.lightMatrix * vec4<f32>(position, 1.0);
    output.clip_position = shadow_pos;
    output.depth = shadow_pos.z / shadow_pos.w;

    return output;
}

// Sample shadow map with PCF (Percentage Closer Filtering)
fn sample_shadow_map_pcf(
    shadowCoords: vec3<f32>,
    texelSize: f32,
    sampleRadius: f32
) -> f32 {
    var shadow = 0.0;
    var samples = 0.0;

    for (var x = -sampleRadius; x <= sampleRadius; x++) {
        for (var y = -sampleRadius; y <= sampleRadius; y++) {
            let offset = vec2<f32>(f32(x), f32(y)) * texelSize;
            let coord = shadowCoords.xy + offset;

            if coord.x >= 0.0 && coord.x <= 1.0 && coord.y >= 0.0 && coord.y <= 1.0 {
                shadow += textureSampleCompare(
                    shadowMap,
                    shadowSampler,
                    coord,
                    shadowCoords.z - shadowData.bias
                );
                samples += 1.0;
            }
        }
    }

    // Use WGSL's select() to choose between shadow/samples and 1.0 based on samples > 0.0
    return select(1.0, shadow / samples, samples > 0.0);
}

// Calculate shadow factor
fn calculate_shadow_factor(worldPosition: vec3<f32>) -> f32 {
    let shadowCoords = (shadowData.lightMatrix * vec4<f32>(worldPosition, 1.0)).xyz;
    let shadowCoords = shadowCoords / shadowCoords.z;
    let shadowCoords = shadowCoords * 0.5 + 0.5;

    if shadowCoords.x < 0.0 || shadowCoords.x > 1.0 || shadowCoords.y < 0.0 || shadowCoords.y > 1.0 || shadowCoords.z < 0.0 || shadowCoords.z > 1.0 {
        return 1.0; // Outside shadow map
    }

    let texelSize = 1.0 / 1024.0; // Assuming 1024x1024 shadow map
    return sample_shadow_map_pcf(shadowCoords, texelSize, 1.0);
}

// Point light shadow sampling
fn sample_point_shadow_map(
    lightToFrag: vec3<f32>,
    lightRadius: f32
) -> f32 {
    let distance = length(lightToFrag);
    let normalizedDistance = distance / lightRadius;
    
    // Simple point light shadow approximation
    let shadowCoords = normalize(lightToFrag);
    let shadowDepth = textureSample(shadowMap, shadowSampler, shadowCoords.xy).r;

    return step(normalizedDistance, shadowDepth + shadowData.bias);
}
