// Core vertex input/output structures
// These define the different vertex formats supported by the engine

// Standard vertex input for most geometry
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
}


// PMX vertex input with skinning data
struct PMXVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) skinIndex: f32, // will be converted to uint in shader
    @location(4) skinWeight: f32,
    @location(5) edgeRatio: f32,
}

// Colored vertex input for vertex-colored geometry
struct ColoredVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
}

// Colored vertex input with normal
struct ColoredVertexInputWithNormal {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
    @location(2) normal: vec3<f32>,
}

// Standard vertex output
struct StandardVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

// PMX vertex output with tangent space
struct PMXVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) world_tangent: vec3<f32>,
    @location(4) world_bitangent: vec3<f32>,
}

// Water-specific vertex output
struct WaterVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) viewDir: vec3<f32>,
}

// Fire-specific vertex output
struct FireVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) flicker: f32,
}

// Simple colored vertex output
struct ColoredVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

// Colored vertex output with normal and UV
struct ColoredVertexOutputWithNormal {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

// Simple vertex output for basic geometry
struct SimpleVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>
}
