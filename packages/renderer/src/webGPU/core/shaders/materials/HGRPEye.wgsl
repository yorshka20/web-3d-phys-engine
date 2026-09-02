// HGRP/CharacterNPR_Eye (brow): ramp shadow blend; the brow uses the skin LUT
// (_UseShadowLutTex). The iris renders through the eye overlay stage instead
// (passes/hgrp_eye_overlay.wgsl — same shading, depth-biased projection). Group-2 bindings
// come from the generated fragment for this variant (material/hgrpContract.ts slot tables).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    return hgrp_shade_eye(
        input.uv0,
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.world_position,
        input.position,
    );
}
