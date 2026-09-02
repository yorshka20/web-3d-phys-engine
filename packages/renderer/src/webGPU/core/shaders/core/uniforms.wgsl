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

// Per-frame scene lighting for the HGRP family (renderer/sceneSettings.ts packSceneLighting):
// the key light direction (toward the light, normalized; w = envGradient), the key light color
// pre-multiplied by its intensity, and the ambient color pre-multiplied by its intensity
// (w = envReflection, the opt-in metal environment-reflection strength).
// metal: the hardware-zone look of the cloth shader (materials/HGRPNpr.wgsl) —
// x = residual diffuse, y = grazing-edge reflection strength, z = edge fresnel power.
struct SceneLighting {
    light_dir: vec4<f32>,
    light: vec4<f32>,
    ambient: vec4<f32>,
    metal: vec4<f32>,
}

// Material debug view (renderer/sceneSettings.ts packHGRPDebugView): x = texture slot id
// (index in the HGRP_TEXTURE_SLOTS registry, -1 = off), y = channel mode
// (core/hgrp_debug.wgsl). The generated per-permutation hgrp_debug_view switches on x.
struct HGRPDebugView {
    view: vec4<f32>,
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

// Field order must match PMX_SHADING_PARAM_SCHEMA in ShadingParamsManager.ts —
// the buffer is packed in schema order.
struct PMXShadingParams {
    light_dir: vec3<f32>,
    ambient_strength: f32,
    emission_intensity: f32,
    diffuse_floor: f32,
    diffuse_gain: f32,
    min_brightness: f32,
    specular_scale_dark: f32,
    specular_scale_bright: f32,
    env_reflection_strength: f32,
    normal_strength: f32,
    normal_threshold: f32,
    saturation: f32,
    _pad0: f32,
    _pad1: f32,
}
