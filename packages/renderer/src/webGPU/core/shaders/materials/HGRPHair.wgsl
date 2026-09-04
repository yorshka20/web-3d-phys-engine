// HGRP/CharacterNPR_Hair: the hair body outside the brow cut-out, shaded by
// lighting/hgrp_hair_shading.wgsl. The strands _HairBrowMask marks (below
// _HairBrowMaskThreshold) are left to the under-brow draw (passes/hgrp_hair_under_brow.wgsl),
// which yields to the eye group's stencil so the brow shows through them
// (hgrp-decompiled-formulas.md §5); this draw occludes the brow like any other surface.
// Group-2 bindings and the subsystem hooks come from the permutation's generated fragments
// (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    if hgrp_brow_cutout(input.uv0) < hgrp_material.hair_brow_mask_threshold {
        discard;
    }
    return hgrp_debug_view(hgrp_shade_hair(input), input.uv0);
}
