// HGRP/CharacterNPR (cloth / general): shared base shading now; spec ramp (_SpecRampMap +
// _MetallicGlossMap) and emission (_EmissionMap, needs Stage E tonemap) layer on here.
// Variant texture bindings 5+: see HGRP_TEXTURE_SLOTS_BY_VARIANT in HGRPMaterialResources.ts.

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    return hgrp_shade_base(input.uv0, input.world_normal);
}
