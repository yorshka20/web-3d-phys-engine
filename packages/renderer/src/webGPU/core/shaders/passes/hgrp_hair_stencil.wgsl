// Hair stencil mark (brow-through compositing, step 1): re-draws the hair geometry
// depth-equal with color writes off, stamping _HairStencilRef into the stencil buffer
// where the _HairBrowMask (sw_M) exceeds _HairBrowMaskThreshold — the region the hair
// permits the brow to show through. Stencil cannot be written per-fragment, so masking is
// a discard. The vertex stage comes from the shared core/hgrp_vertex.wgsl include, which
// guarantees depths identical to the opaque hair draw.

@group(2) @binding(8) var hair_brow_mask: texture_2d<f32>; // _HairBrowMask (sw_M)

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let mask = textureSample(hair_brow_mask, base_sampler, input.uv0).r;
    if mask < hgrp_material.hair_brow_mask_threshold {
        discard;
    }
    // Color writes are masked off in the pipeline; only the stencil replace matters
    return vec4<f32>(0.0);
}
