@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let vertexIndex = id.x;
    if vertexIndex >= morphInfo.vertexCount { return; }

    var result = baseVertices[vertexIndex];
        
    // apply all active morph targets
    for (var morphIndex = 0u; morphIndex < morphInfo.morphCount; morphIndex++) {
        let weight = morphWeights[morphIndex];
        if weight > 0.001 {
            let targetIndex = morphIndex * morphInfo.vertexCount + vertexIndex;
            let morphVertex = morphTargets[targetIndex];

            result.position += morphVertex.position * weight;
            result.normal += morphVertex.normal * weight;
            // UV does not participate in morph
        }
    }
        
    // re-normalize normal
    result.normal = normalize(result.normal);
    outputVertices[vertexIndex] = result;
}