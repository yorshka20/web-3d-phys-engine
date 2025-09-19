// Core vertex input/output structures
// These define the different vertex formats supported by the engine

// Standard vertex input for most geometry
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
}


/**
 * PMX vertex input with skinning data.  
 * can have type 0,1,2,3, but we will uniform it to vec4f for skin_index and skin_weight.
 * 
 * BDEF1 (type=0): 1 bone，skin_indices=[index]
 * BDEF2 (type=1): 2 bones，skin_indices=[index1, index2]
 * BDEF4 (type=2): 4 bones，skin_indices=[index1, index2, index3, index4]
 * SDEF (type=3): 2 bones+sphere deformation，skin_indices=[index1, index2]
 */
struct PMXVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) skin_indices: vec4f, // use float to keep the same format as the input. convert to uint in shader.
    @location(4) skin_weights: vec4f,
    @location(5) edge_ratio: f32,
}


struct MorphInfo {
    vertex_count: u32,
    morph_count: u32,
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
    @location(0) world_pos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) view_dir: vec3<f32>,
}

// Fire-specific vertex output
struct FireVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
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
