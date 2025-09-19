// Morph processing control constant
#ifdef ENABLE_MORPH_PROCESSING
override morph_processing: f32 = 1.0;
#else
override morph_processing: f32 = 0.0;
#endif

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let vertex_index = id.x;
    if vertex_index >= morph_info.vertex_count { return; }

    var result = base_vertices[vertex_index];
    
    // Only apply morph processing if enabled
    if morph_processing > 0.5 {
        // apply all active morph targets
        for (var morph_index = 0u; morph_index < morph_info.morph_count; morph_index++) {
            let weight = morph_weights[morph_index];
            if weight > 0.001 {
                let target_index = morph_index * morph_info.vertex_count + vertex_index;
                let morph_vertex = morph_targets[target_index];

                result.position += morph_vertex.position * weight;
                result.normal += morph_vertex.normal * weight;
            }
        }

        result.normal = normalize(result.normal);
    }

    output_vertices[vertex_index] = result;
}