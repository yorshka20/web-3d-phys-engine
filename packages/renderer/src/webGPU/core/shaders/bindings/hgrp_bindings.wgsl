// Bindings shared by every HGRP variant shader: groups 0 (time), 1 (per-draw transform) and
// 3 (per-frame globals). Group 2 — the material uniform block, texture slots and shared
// samplers — is generated per permutation from the material contract (material/hgrp/wgsl.ts)
// and included alongside this fragment. A shader may leave declared bindings unused (the VFX
// variant takes no rim, so it never reads scene_depth).

// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

// Group 1: per-draw vertex transform — the MVP uniform plus the skeletal joint palette
// (skinning math in core/gltf_skinning.wgsl; non-skinned draws bind a single identity).
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;
@group(1) @binding(1) var<storage, read> joint_matrices: array<mat4x4<f32>>;

// Group 3: per-frame globals — the depth-prepass texture (cleared to the far plane where
// nothing was drawn), read by the screen-space rim.
@group(3) @binding(0) var scene_depth: texture_depth_2d;
