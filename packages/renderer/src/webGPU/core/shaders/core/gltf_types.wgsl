struct VertexInput {
    @location(0) position: vec3<f32>,      // POSITION
    @location(1) normal: vec3<f32>,        // NORMAL  
    @location(2) texcoord_0: vec2<f32>,    // TEXCOORD_0
    @location(3) texcoord_1: vec2<f32>,    // TEXCOORD_1 (optional)
    @location(4) color_0: vec4<f32>,       // COLOR_0 (optional)
    @location(5) joints_0: vec4<u32>,      // JOINTS_0 (optional)
    @location(6) weights_0: vec4<f32>,     // WEIGHTS_0 (optional)
    @location(7) tangent: vec4<f32>,       // TANGENT (optional)
}


struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) world_tangent: vec3<f32>,
    @location(3) world_bitangent: vec3<f32>,
    @location(4) uv0: vec2<f32>,
    @location(5) uv1: vec2<f32>,
    @location(6) color: vec4<f32>,
}

struct JointMatrices {
    matrices: array<mat4x4<f32>, 512>,  // at most 512 joints
}

struct PBRMaterial {
    // base color
    base_color_factor: vec4<f32>,           // default (1,1,1,1)
    
    // metallic roughness
    metallic_factor: f32,                   // default 1.0
    roughness_factor: f32,                  // default 1.0
    
    // normal map strength
    normal_scale: f32,                      // default 1.0
    
    // occlusion strength
    occlusion_strength: f32,                // default 1.0
    
    // emissive factor
    emissive_factor: vec3<f32>,            // default (0,0,0)
    
    // alpha related
    alpha_cutoff: f32,                     // MASK mode threshold, default 0.5
}
