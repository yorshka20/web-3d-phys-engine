// Core uniform structures for all shaders
// This fragment contains the fundamental uniform structures

// Time-related uniforms
struct TimeUniforms {
    time: f32,
    delta_time: f32,
    frame_count: u32,
    padding: u32,
}

// MVP matrix uniforms
struct MVPUniforms {
    mvp_matrix: mat4x4<f32>,           // Model * View * Projection
    model_matrix: mat4x4<f32>,         // Model transformation
    view_matrix: mat4x4<f32>,          // View transformation  
    projection_matrix: mat4x4<f32>,    // Projection transformation
    normal_matrix: mat4x4<f32>,        // adjoint of model_matrix
    camera_pos: vec3<f32>,             // Camera position
    camera_forward: vec3<f32>,         // Camera forward direction
    camera_up: vec3<f32>,              // Camera up direction
    camera_right: vec3<f32>,           // Camera right direction
}

// Standard PBR material uniforms
struct MaterialUniforms {
    albedo: vec4<f32>,
    metallic: f32,
    roughness: f32,
    emissive: vec4<f32>,
    emissive_intensity: f32,
}

// PMX-specific material uniforms
struct PMXMaterialUniforms {
    diffuse: vec4<f32>,
    specular: vec3<f32>,
    shininess: f32,
    ambient: vec3<f32>,
    edge_color: vec4<f32>,
    edge_size: f32,
    alpha: f32,
    toon_flag: f32,
    env_flag: f32,
    sphere_mode: f32,
    padding: f32,
}
