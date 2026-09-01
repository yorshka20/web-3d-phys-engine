// HGRP/CharacterNPR_Eye (brow): ramp shadow blend; the brow uses the skin LUT
// (_UseShadowLutTex). The iris renders through the eye overlay stage instead
// (passes/hgrp_eye_overlay.wgsl — same shading, depth-biased projection). Binding indices
// must match the HGRP_TEXTURE_SLOTS_BY_VARIANT slot order in HGRPMaterialResources.ts.

@group(2) @binding(5) var matcap_tex: texture_2d<f32>; // _MatcapTex
@group(2) @binding(6) var shadow_lut: texture_2d<f32>; // _ShadowLutTex

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
