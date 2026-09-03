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

// Per-frame scene lighting for the HGRP family (renderer/sceneSettings.ts packSceneLighting).
// The fields are what the decompiled character shader reads from its engine globals
// (learnings hgrp-decompiled-formulas.md §0): the key light, and the `_CharacterParams*`
// constants under their game names, so every constant in lighting/hgrp_npr.wgsl points back
// at a row of that table. `env_stand_in` describes the hemisphere that stands in for the
// character cubemap the rip did not carry.
struct SceneLighting {
    // xyz: L, toward the key light (unit); w: _CharacterParams11.w, the ramp coordinate bias
    light_dir: vec4<f32>,
    // rgb: key light color x intensity (Lc); w: environment intensity — the scene probe's
    // irradiance x _EnvironmentGlobalParams0.x, a calibration knob (sceneSettings.ambientIntensity)
    light_color: vec4<f32>,
    // _CharacterParams0: y lighting multiplier, z shadow multiplier, w IBL multiplier (x unread)
    character_params0: vec4<f32>,
    // _CharacterParams2 (rgb): environment color where no light probe applies — cloth / hair / eye
    env_color: vec4<f32>,
    // _CharacterParams3 (rgb): the same for the skin shader
    env_color_skin: vec4<f32>,
    // _CharacterParams6 (xyz): hemisphere axis
    hemi_axis: vec4<f32>,
    // _CharacterParams7 (xyz): hemisphere bias, scale, floor
    hemi_params: vec4<f32>,
    // Cubemap stand-in (sceneSettings.envGradient / envRadiance): x up/down contrast of the
    // hemisphere, y its radiance
    env_stand_in: vec4<f32>,
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
