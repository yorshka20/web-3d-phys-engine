// Core uniform structures for all shaders
// This fragment contains the fundamental uniform structures

// Time-related uniforms
struct TimeUniforms {
    time: f32,
    deltaTime: f32,
    frameCount: u32,
    padding: u32,
}

// MVP matrix uniforms
struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
    cameraPos: vec3<f32>,
    padding: f32,
}

// Standard PBR material uniforms
struct MaterialUniforms {
    albedo: vec4<f32>,
    metallic: f32,
    roughness: f32,
    emissive: vec4<f32>,
    emissiveIntensity: f32,
}

// PMX-specific material uniforms
struct PMXMaterialUniforms {
    diffuse: vec4<f32>,
    specular: vec3<f32>,
    shininess: f32,
    ambient: vec3<f32>,
    edgeColor: vec4<f32>,
    edgeSize: f32,
    alpha: f32,
    toonFlag: f32,
    envFlag: f32,
    sphereMode: f32,
    padding: f32,
}
