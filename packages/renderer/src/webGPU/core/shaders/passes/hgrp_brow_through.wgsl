// Brow through-hair overlay (brow-through compositing, step 2): re-draws the brow where it
// is OCCLUDED (depth compare greater) and the stencil carries the hair's mark — i.e. only
// through the bangs region the hair's sw_M mask opened. Blends the normal brow shading at a
// fixed opacity (v1 calibration constant; the game's through-opacity did not survive the
// rip). The vertex stage comes from the shared core/hgrp_vertex.wgsl include.

@group(2) @binding(5) var matcap_tex: texture_2d<f32>; // _MatcapTex (default white on brows)
@group(2) @binding(6) var shadow_lut: texture_2d<f32>; // _ShadowLutTex

const HGRP_BROW_THROUGH_OPACITY: f32 = 0.4;

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let shaded = hgrp_shade_eye(
        input.uv0,
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.world_position,
        input.position,
    );
    return vec4<f32>(shaded.rgb, HGRP_BROW_THROUGH_OPACITY);
}
