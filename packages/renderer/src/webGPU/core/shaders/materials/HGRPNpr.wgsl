// HGRP/CharacterNPR (cloth / general): normal-mapped ramp shadow blend with HSV shadow
// color. Spec ramp (_SpecRampMap + _MetallicGlossMap) and emission (_EmissionMap, needs
// Stage E tonemap) layer on here. Binding indices must match the
// HGRP_TEXTURE_SLOTS_BY_VARIANT slot order in HGRPMaterialResources.ts.

@group(2) @binding(5) var bump_map: texture_2d<f32>; // _BumpMap

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_perturb_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        bump_map,
        base_sampler,
        input.uv0,
        hgrp_material.use_bump_map,
        hgrp_material.bump_scale,
    );
    return hgrp_shade_core(input.uv0, n);
}
