struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

struct TimeUniforms {
    time: f32,
    deltaTime: f32,
    frameCount: u32,
    padding: u32,
}

struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
    cameraPos: vec3<f32>,
    padding: f32,
}

// Fixed bind group indices
@group(0) @binding(0) var<uniform> timeData: TimeUniforms;           // TIME
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;                 // MVP
@group(2) @binding(0) var texture: texture_2d<f32>;                  // TEXTURE
@group(2) @binding(1) var textureSampler: sampler;                   // TEXTURE
@group(3) @binding(0) var<uniform> material: MaterialUniforms;       // MATERIAL

