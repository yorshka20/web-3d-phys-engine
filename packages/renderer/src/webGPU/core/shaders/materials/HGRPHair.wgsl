// HGRP/CharacterNPR_Hair: ramp shadow blend with HSV shadow color.
//
// The anisotropic strand highlight is PARKED (2026-09-01): three coordinate hypotheses
// (signed/folded bitangent, folded tangent) all produced halos instead of the game's thin
// band, and the split-normal texture (_SplitNormalMap) probes near-flat — the RS band
// coordinate needs the dedicated material-forensics session (see ROADMAP "HGRP 材质语义专项"
// and learnings hgrp-shading.md). Until then hair renders with the verified ramp shading
// only. _HairBrowMask compositing is Stage D scope.

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    return hgrp_shade_standard(input.uv0, input.world_normal, input.world_position);
}
