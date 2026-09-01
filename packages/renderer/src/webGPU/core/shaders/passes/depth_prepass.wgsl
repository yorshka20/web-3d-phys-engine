// Depth-only prepass: renders the HGRP character into a sampleable depth texture that the
// forward pass reads for screen-space effects (depth rim). Standalone source (imported
// directly by DepthPrepass.ts, same rule as tonemap.wgsl — a fixed single-pipeline pass
// does not go through the material-shader registration machinery), so structs are declared
// here. The uniform declares only the leading matrices of MVPUniforms — a shader-side
// struct smaller than the bound buffer is valid, and the position transform must match
// hgrp_vertex.wgsl (projection * view * model) so prepass and forward depths agree.

struct PrepassMVPUniforms {
    mvp_matrix: mat4x4<f32>,
    model_matrix: mat4x4<f32>,
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> mvp: PrepassMVPUniforms;

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
    return mvp.projection_matrix * mvp.view_matrix * mvp.model_matrix *
        vec4<f32>(position, 1.0);
}
