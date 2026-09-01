// HGRP/CharacterNPR_Hair: ramp shadow blend with HSV shadow color. Anisotropic highlight
// (_SplitNormalMap), spec ramp, hair line map and hair-over-brow mask (_HairBrowMask,
// stencil compositing in Stage D) layer on here. Variant texture bindings 5+: see
// HGRP_TEXTURE_SLOTS_BY_VARIANT in HGRPMaterialResources.ts.

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    return hgrp_shade_standard(input.uv0, input.world_normal, input.world_position);
}
