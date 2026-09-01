// HGRP/CharacterNPR_Skin (face + body): shared base shading now; SDF face shadow
// (_SDFLightmap/_SDFMask), _ShadowLutTex shadow coloring, highlight and emotion atlas layer
// on here. Variant texture bindings 5+: see HGRP_TEXTURE_SLOTS_BY_VARIANT in
// HGRPMaterialResources.ts.

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    return hgrp_shade_base(input.uv0, input.world_normal);
}
