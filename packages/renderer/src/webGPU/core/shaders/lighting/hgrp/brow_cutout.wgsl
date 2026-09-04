// Brow cut-out subsystem (_DrawUnderBrow): the R channel of _HairBrowMask (sw_M), painted black
// on the bang strands that hang over the brows. The hair shader and its outline hull discard
// where it falls below _HairBrowMaskThreshold — the decompiled hair PreGBuffer, DepthOnlyOutline
// and CharacterOutline passes do the same, leaving a depth hole the brow and the skin show
// through (hgrp-decompiled-formulas.md §5). Off-stub: 1.0, nothing is cut.
fn hgrp_brow_cutout(uv0: vec2<f32>) -> f32 {
    return textureSample(hair_brow_mask, base_sampler, uv0).r;
}
