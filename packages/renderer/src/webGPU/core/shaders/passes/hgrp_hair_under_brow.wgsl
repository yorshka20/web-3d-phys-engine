// The hair strands inside the brow cut-out — _HairBrowMask below _HairBrowMaskThreshold, the
// bangs over the brows — drawn by HGRPHairUnderBrowStage after the opaque walk with the game's
// hair stencil yield (hgrp-decompiled-formulas.md §5: Ref _HairStencilRef, ReadMask 16,
// GEqual), so they skip every pixel the brow stamped and the brow shows through them at full
// strength. Shading is the hair material's (lighting/hgrp_hair_shading.wgsl); the vertex stage
// is the shared core/hgrp_vertex.wgsl, so the depth matches the hair body's. Group-2 bindings
// come from the Hair permutation's generated fragment.

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    if hgrp_brow_cutout(input.uv0) >= hgrp_material.hair_brow_mask_threshold {
        discard;
    }
    return hgrp_debug_view(hgrp_shade_hair(input), input.uv0);
}
