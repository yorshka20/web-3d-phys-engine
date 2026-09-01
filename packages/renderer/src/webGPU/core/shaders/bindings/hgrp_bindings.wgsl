// Common bindings shared by every HGRP variant shader. Variant-specific texture bindings
// (binding 5 and up, wired in HGRPMaterialResources.ts slot tables) are declared inside the
// variant material shaders as their features consume them — a pipeline layout may carry more
// entries than the shader declares.
// The HGRPMaterialParams struct lives in core/hgrp_types.wgsl (shared with the outline
// shader) — include it before this fragment.

// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

// Group 1: per-draw vertex transform — the MVP uniform plus the skeletal joint palette
// (skinning math in core/gltf_skinning.wgsl; non-skinned draws bind a single identity).
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;
@group(1) @binding(1) var<storage, read> joint_matrices: array<mat4x4<f32>>;

// Group 2: HGRP material params + textures.
// Samplers are shared across textures (not one per texture): default WebGPU limits allow
// 16 sampled textures AND 16 samplers per stage, and the skin variant alone carries
// 9 textures.
@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;
@group(2) @binding(1) var base_map: texture_2d<f32>;
@group(2) @binding(2) var diff_ramp_map: texture_2d<f32>;
@group(2) @binding(3) var base_sampler: sampler;
@group(2) @binding(4) var ramp_sampler: sampler;

// Group 3: per-frame globals — the depth-prepass texture (cleared to the far plane where
// nothing was drawn), read by the screen-space rim.
@group(3) @binding(0) var scene_depth: texture_depth_2d;
