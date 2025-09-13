// Deferred rendering pass definitions
// This file contains structures for G-Buffer generation and deferred lighting

// G-Buffer output structure
struct GBufferOutput {
    @location(0) albedo: vec4<f32>,        // RGB + Metallic
    @location(1) normal: vec4<f32>,        // XYZ + Roughness
    @location(2) material: vec4<f32>,      // Emission + AO + Unused
    @location(3) depth: f32,          // Linear depth
}

// G-Buffer input structure for deferred lighting
struct GBufferInput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) material: vec4<f32>,
    @location(3) depth: f32,
}

// Deferred rendering vertex output
struct DeferredVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) view_direction: vec3<f32>,
}

// Encode normal vector to vec4<f32> (with roughness)
fn encode_normal_roughness(normal: vec3<f32>, roughness: f32) -> vec4<f32> {
    return vec4<f32>(normal * 0.5 + 0.5, roughness);
}

// Decode normal vector from vec4<f32>
fn decode_normal_roughness(encoded: vec4<f32>) -> (vec3<f32>, f32) {
    let normal = normalize(encoded.xyz * 2.0 - 1.0);
    return (normal, encoded.w);
}

// Encode albedo with metallic
fn encode_albedo_metallic(albedo: vec3<f32>, metallic: f32) -> vec4<f32> {
    return vec4<f32>(albedo, metallic);
}

// Decode albedo and metallic
fn decode_albedo_metallic(encoded: vec4<f32>) -> (vec3<f32>, f32) {
    return (encoded.xyz, encoded.w);
}

// Write to G-Buffer
fn write_gbuffer(
    albedo: vec3<f32>,
    metallic: f32,
    normal: vec3<f32>,
    roughness: f32,
    emissive: vec3<f32>,
    ao: f32,
    depth: f32
) -> GBufferOutput {
    var gbuffer: GBufferOutput;

    gbuffer.albedo = encode_albedo_metallic(albedo, metallic);
    gbuffer.normal = encode_normal_roughness(normal, roughness);
    gbuffer.material = vec4<f32>(emissive, ao);
    gbuffer.depth = depth;

    return gbuffer;
}

// Read from G-Buffer
fn read_gbuffer(input: GBufferInput) -> (vec3<f32>, f32, vec3<f32>, f32, vec3<f32>, f32, f32) {
    let (albedo, metallic) = decode_albedo_metallic(input.albedo);
    let (normal, roughness) = decode_normal_roughness(input.normal);
    let emissive = input.material.xyz;
    let ao = input.material.w;
    let depth = input.depth;
    
    return (albedo, metallic, normal, roughness, emissive, ao, depth);
}
