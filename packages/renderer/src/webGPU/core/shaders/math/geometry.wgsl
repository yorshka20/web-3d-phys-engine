// Geometric utility functions

// Calculate tangent space basis vectors
fn calculate_tangent_space(normal: vec3<f32>) -> mat3x3<f32> {
    let up = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.y) > 0.9);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);
    return mat3x3<f32>(tangent, bitangent, normal);
}

// Transform vector from tangent space to world space
fn tangent_to_world(tangent_vector: vec3<f32>, TBN: mat3x3<f32>) -> vec3<f32> {
    return normalize(TBN * tangent_vector);
}

// Transform vector from world space to tangent space
fn world_to_tangent(world_vector: vec3<f32>, TBN: mat3x3<f32>) -> vec3<f32> {
    return normalize(transpose(TBN) * world_vector);
}

// Normal map unpacking (tangent space to world space)
fn unpack_normal_map(normal_sample: vec3<f32>) -> vec3<f32> {
    return normalize(normal_sample * 2.0 - 1.0);
}
