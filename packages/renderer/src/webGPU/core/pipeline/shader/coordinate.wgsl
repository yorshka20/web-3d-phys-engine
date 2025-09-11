struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
}
      
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

struct TimeUniforms {
    time: f32,
    deltaTime: f32,
    frameCount: u32,
    padding: u32,
}

struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> timeData: TimeUniforms;
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) color: vec4<f32>) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = mvp.mvpMatrix * vec4<f32>(position, 1.0);
    out.color = color;
    return out;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
    return color;
}
 