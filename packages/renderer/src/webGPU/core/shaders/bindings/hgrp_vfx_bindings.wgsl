// Bindings for the VFX variant. Groups 0/1 match the other HGRP shaders; group 2 differs —
// binding 0 is HGRPVfxParams rather than HGRPMaterialParams, and the variant's own textures
// start at 5 as usual. The layout also carries the family's common _BaseMap/_DiffRampMap at
// bindings 1-2 (HGRP_TEXTURE_SLOTS_COMMON is added for every variant); this shader samples
// neither, which a layout is allowed to outlive. Group 3 (prepass depth) goes undeclared for
// the same reason — the effect takes no screen-space rim.

@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

@group(1) @binding(0) var<uniform> mvp: MVPUniforms;
@group(1) @binding(1) var<storage, read> joint_matrices: array<mat4x4<f32>>;

@group(2) @binding(0) var<uniform> hgrp_vfx: HGRPVfxParams;
@group(2) @binding(3) var base_sampler: sampler;
@group(2) @binding(4) var ramp_sampler: sampler;
@group(2) @binding(5) var main_tex: texture_2d<f32>; // _MainTex
@group(2) @binding(6) var blend_tex: texture_2d<f32>; // _BlendTex
@group(2) @binding(7) var disturb_tex1: texture_2d<f32>; // _DisturbTex1
@group(2) @binding(8) var mask_tex: texture_2d<f32>; // _MaskTex
