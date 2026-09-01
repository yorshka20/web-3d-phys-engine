// Shared vertex stage for every HGRP variant shader (glTF 26-float vertex layout). Lives in
// one include so skeletal skinning (Stage F) lands here once instead of in four copies.

@vertex
fn vs_main(input: GLTFVertexInput) -> GLTFVertexOutput {
    var output: GLTFVertexOutput;

    let world_position = mvp.model_matrix * vec4<f32>(input.position, 1.0);
    output.world_position = world_position.xyz;
    output.position = mvp.projection_matrix * mvp.view_matrix * world_position;

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
