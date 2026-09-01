// HGRP eye overlay: the iris, which sits behind the face's eye-white surface. Instead of
// the game's pre-Z stencil compositing (its writer semantics did not survive the rip — and
// the eye-white shadow shell only covers the UPPER eye, so it cannot stamp the opening),
// the projected position is pulled toward the camera by a small world-space offset: the
// iris wins the depth test against the eye-white millimetres in front of it, but still
// loses to the cheek/hair centimetres in front at grazing angles. Shading uses the TRUE
// world position/normal — only the clip-space depth is biased.

@group(2) @binding(6) var shadow_lut: texture_2d<f32>; // _ShadowLutTex

// World-space pull toward the camera. The scene presents the character at 10x model scale,
// so 0.06 world units = 6mm in model space — beats the iris->eye-white gap, far below the
// cheek depth at grazing angles. Calibration constant (v1).
const HGRP_EYE_DEPTH_OFFSET: f32 = 0.06;

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
    return hgrp_shade_eye(input.uv0, input.world_normal, input.world_position);
}
