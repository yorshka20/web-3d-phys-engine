// Vertex entry of the HGRP modules outside the CharacterNPR shading family (the effect and the
// overlay-shadow variants): the shared stage as is.
@vertex
fn vs_main(input: GLTFVertexInput) -> GLTFVertexOutput {
    return hgrp_vertex_output(input);
}
