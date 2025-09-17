@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let vertexIndex = id.x;
    if vertexIndex >= morph_info.vertex_count { return; }

    var result = base_vertices[vertexIndex];
        
    // apply all active morph targets
    for (var morphIndex = 0u; morphIndex < morph_info.morph_count; morphIndex++) {
        let weight = morph_weights[morphIndex];
        if weight > 0.001 {
            let targetIndex = morphIndex * morph_info.vertex_count + vertexIndex;
            let morphVertex = morph_targets[targetIndex];

            result.position += morphVertex.position * weight;
            result.normal += morphVertex.normal * weight;
        }
    }

    result.normal = normalize(result.normal);
    output_vertices[vertexIndex] = result;
}