// Linear-blend skinning against the joint palette in group 1 (see MVPUniformManager: the
// palette shares the per-draw transform group with the model matrix). The `joint_matrices`
// binding itself is declared by each entry shader — module-scope declarations are
// order-independent, so this file only holds the math.
//
// Every draw binds a palette: a non-skinned one gets the shared single-identity buffer, and
// the vertex defaults (joint 0, weight 1) then resolve to a no-op. That is why there is no
// "is skinned" branch here.

fn gltf_skin_matrix(joints: vec4<u32>, weights: vec4<f32>) -> mat4x4<f32> {
    let total = weights.x + weights.y + weights.z + weights.w;
    // A vertex with no weights would otherwise collapse to the origin
    if total <= 0.0 {
        return mat4x4<f32>(
            vec4<f32>(1.0, 0.0, 0.0, 0.0),
            vec4<f32>(0.0, 1.0, 0.0, 0.0),
            vec4<f32>(0.0, 0.0, 1.0, 0.0),
            vec4<f32>(0.0, 0.0, 0.0, 1.0),
        );
    }

    let blended =
        joint_matrices[joints.x] * weights.x +
        joint_matrices[joints.y] * weights.y +
        joint_matrices[joints.z] * weights.z +
        joint_matrices[joints.w] * weights.w;

    return blended * (1.0 / total);
}
