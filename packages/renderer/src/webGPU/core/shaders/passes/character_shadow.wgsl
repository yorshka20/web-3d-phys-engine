// Character self-shadow map: the HGRP character rendered depth-only from the key light, which
// the forward pass samples as the occlusion term the game's shading reads (the
// `_ScreenSpaceShadowMask.y` slot: hair onto the face, a sleeve onto an arm). Standalone source
// imported by CharacterShadowPass.ts, same rule as depth_prepass.wgsl, so its structs are
// declared here.
//
// The position transform is the LIGHT's view-projection times the draw's model matrix — the
// per-draw uniform's own mvp/view/projection are the camera's and are not read.

struct ShadowMVPUniforms {
    mvp_matrix: mat4x4<f32>,
    model_matrix: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> mvp: ShadowMVPUniforms;
// The same joint palette the forward pass binds (group 1 there, group 0 here);
// gltf_skin_matrix comes from core/gltf_skinning.wgsl, prepended by the pass.
@group(0) @binding(1) var<storage, read> joint_matrices: array<mat4x4<f32>>;

struct ShadowCamera {
    light_view_proj: mat4x4<f32>,
}

@group(1) @binding(0) var<uniform> shadow_camera: ShadowCamera;

@vertex
fn vs_main(
    @location(0) position: vec3<f32>,
    @location(5) joints_0: vec4<u32>,
    @location(6) weights_0: vec4<f32>,
) -> @builtin(position) vec4<f32> {
    let skin = gltf_skin_matrix(joints_0, weights_0);
    return shadow_camera.light_view_proj * mvp.model_matrix * skin * vec4<f32>(position, 1.0);
}
