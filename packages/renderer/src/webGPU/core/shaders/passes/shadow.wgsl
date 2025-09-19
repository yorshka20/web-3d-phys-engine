// Shadow mapping pass definitions
// This file contains structures and functions for shadow mapping

// Shadow map vertex output
struct ShadowVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) depth: f32,
}

// Shadow map uniforms
struct ShadowUniforms {
    light_matrix: mat4x4<f32>,
    light_position: vec3<f32>,
    light_radius: f32,
    bias: f32,
}

// Shadow map bindings
@group(2) @binding(0) var<uniform> shadow_data: ShadowUniforms;
@group(2) @binding(1) var shadow_map: texture_depth_2d;
@group(2) @binding(2) var shadow_sampler: sampler_comparison;

// Transform vertex for shadow mapping
fn shadow_vertex_transform(position: vec3<f32>) -> ShadowVertexOutput {
    var output: ShadowVertexOutput;

    let shadow_pos = shadow_data.light_matrix * vec4<f32>(position, 1.0);
    output.clip_position = shadow_pos;
    output.depth = shadow_pos.z / shadow_pos.w;

    return output;
}

// Sample shadow map with PCF (Percentage Closer Filtering)
fn sample_shadow_map_pcf(
    shadow_coords: vec3<f32>,
    texel_size: f32,
    sample_radius: f32
) -> f32 {
    var shadow = 0.0;
    var samples = 0.0;

    for (var x = -sample_radius; x <= sample_radius; x++) {
        for (var y = -sample_radius; y <= sample_radius; y++) {
            let offset = vec2<f32>(f32(x), f32(y)) * texel_size;
            let coord = shadow_coords.xy + offset;

            if coord.x >= 0.0 && coord.x <= 1.0 && coord.y >= 0.0 && coord.y <= 1.0 {
                shadow += textureSampleCompare(
                    shadow_map,
                    shadow_sampler,
                    coord,
                    shadow_coords.z - shadow_data.bias
                );
                samples += 1.0;
            }
        }
    }

    // Use WGSL's select() to choose between shadow/samples and 1.0 based on samples > 0.0
    return select(1.0, shadow / samples, samples > 0.0);
}

// Calculate shadow factor
fn calculate_shadow_factor(world_position: vec3<f32>) -> f32 {
    let shadow_coords = (shadow_data.light_matrix * vec4<f32>(world_position, 1.0)).xyz;
    let shadow_coords = shadow_coords / shadow_coords.z;
    let shadow_coords = shadow_coords * 0.5 + 0.5;

    if shadow_coords.x < 0.0 || shadow_coords.x > 1.0 || shadow_coords.y < 0.0 || shadow_coords.y > 1.0 || shadow_coords.z < 0.0 || shadow_coords.z > 1.0 {
        return 1.0; // Outside shadow map
    }

    let texel_size = 1.0 / 1024.0; // Assuming 1024x1024 shadow map
    return sample_shadow_map_pcf(shadow_coords, texel_size, 1.0);
}

// Point light shadow sampling
fn sample_point_shadow_map(
    light_to_frag: vec3<f32>,
    light_radius: f32
) -> f32 {
    let distance = length(light_to_frag);
    let normalized_distance = distance / light_radius;
    
    // Simple point light shadow approximation
    let shadow_coords = normalize(light_to_frag);
    let shadow_depth = textureSample(shadow_map, shadow_sampler, shadow_coords.xy).r;

    return step(normalized_distance, shadow_depth + shadow_data.bias);
}
