// HGRP/CharacterNPR_Skin (face + body): normal-mapped ramp shadow blend; the shadow color
// comes from the skin color-grading LUT (_UseShadowLutTex) when that subsystem is on, else
// from the HSV adjustment. With the SDF subsystem on (face), the ramp coordinate is the SDF
// face-shadow factor instead of half-Lambert n.l (lighting/hgrp/sdf.wgsl). The nose highlight
// and emission layer on top; _SDFMask is consumed by the sdf hook, the emotion atlas is still
// to come. Group-2 bindings and the subsystem hooks come from the permutation's generated
// fragments (material/hgrp).

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    let n = hgrp_shading_normal(
        input.world_normal,
        input.world_tangent,
        input.world_bitangent,
        input.uv0,
    );
    let core = hgrp_shade_core(input.uv0, n, n, input.position);
    let highlight = hgrp_face_highlight(input.uv0);
    let emission = hgrp_emission(input.uv0);

    return vec4<f32>(core.lit + hgrp_ambient(core.albedo, n) + highlight + emission, core.alpha);
}
