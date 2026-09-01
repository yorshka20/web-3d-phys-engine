// HGRP/CharacterNPR_Eye (brow + iris): shared base shading now; matcap (_MatcapTex) and
// _ShadowLutTex layer on here. The iris only becomes visible through the Stage D pre-Z /
// stencil compositing (_PreZStencilRefOption) — grey eyes are expected until then.
// Variant texture bindings 5+: see HGRP_TEXTURE_SLOTS_BY_VARIANT in HGRPMaterialResources.ts.

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    return hgrp_shade_base(input.uv0, input.world_normal);
}
