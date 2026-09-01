// HGRP eye overlay: the iris, which sits behind the face's eye-white surface. Instead of
// the game's pre-Z stencil compositing (its writer semantics did not survive the rip — and
// the eye-white shadow shell only covers the UPPER eye, so it cannot stamp the opening),
// the projected position is pulled toward the camera by a small world-space offset: the
// iris wins the depth test against the eye-white millimetres in front of it, but still
// loses to the cheek/hair centimetres in front at grazing angles. Shading uses the TRUE
// world position/normal — only the clip-space depth is biased.

@group(2) @binding(5) var matcap_tex: texture_2d<f32>; // _MatcapTex
@group(2) @binding(6) var shadow_lut: texture_2d<f32>; // _ShadowLutTex

// World-space pull toward the camera. The scene presents the character at 10x model scale
// (0.03 world = 3mm model): large enough that the iris CENTER beats the eye-white just in
// front of it, small enough that the card's top padding — which sits deeper behind the
// upper eye-white — loses and lets the white show, approximating the game's stencil crop
// (the near-black upper eye was the card padding showing through, diagnosed 2026-09-01).
// Calibration constant.
const HGRP_EYE_DEPTH_OFFSET: f32 = 0.03;

@vertex
fn vs_main(input: GLTFVertexInput) -> GLTFVertexOutput {
    var output: GLTFVertexOutput;

    let world_position = mvp.model_matrix * vec4<f32>(input.position, 1.0);
    output.world_position = world_position.xyz;

    let to_camera = normalize(mvp.camera_pos - world_position.xyz);
    let biased = world_position.xyz + to_camera * HGRP_EYE_DEPTH_OFFSET;
    output.position = mvp.projection_matrix * mvp.view_matrix * vec4<f32>(biased, 1.0);

    output.world_normal = normalize((mvp.normal_matrix * vec4<f32>(input.normal, 0.0)).xyz);
    if length(input.tangent.xyz) > 0.0 {
        output.world_tangent = normalize((mvp.model_matrix * vec4<f32>(input.tangent.xyz, 0.0)).xyz);
        output.world_bitangent = cross(output.world_normal, output.world_tangent) * input.tangent.w;
    } else {
        output.world_tangent = vec3<f32>(1.0, 0.0, 0.0);
        output.world_bitangent = vec3<f32>(0.0, 0.0, 1.0);
    }

    output.uv0 = input.texcoord_0;
    output.uv1 = input.texcoord_1;
    output.color = input.color_0;

    return output;
}

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    // frag_coord.z carries the camera-biased overlay depth (slightly nearer than the true
    // surface); the iris path takes no rim, so the bias never reaches an edge test.
    return hgrp_shade_eye(
        input.uv0,
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.world_position,
        input.position,
    );
}
