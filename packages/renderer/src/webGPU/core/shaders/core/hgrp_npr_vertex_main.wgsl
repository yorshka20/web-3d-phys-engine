// Vertex entry of the CharacterNPR shading family: the shared stage, then the material's
// base-map tiling on uv0 — the game's vertex stage applies _BaseMap_ST once, and every
// per-texture _ST composes on top of it in the fragment — and the fur subsystem's shell
// extrusion (a hook, so a material without fur pays nothing).
@vertex
fn vs_main(input: GLTFVertexInput) -> GLTFVertexOutput {
    var output = hgrp_vertex_output(input);
    let st = hgrp_material.base_map_st;
    output.uv0 = input.texcoord_0 * st.xy + st.zw;
    output.position = hgrp_fur_extrude(
        output.position,
        output.world_normal,
        input.texcoord_0,
        input.texcoord_1.x,
    );
    return output;
}
