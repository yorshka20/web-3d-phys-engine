// Shared HGRP NPR shading core. References the common HGRP bindings declared by
// bindings/hgrp_bindings.wgsl (hgrp_material, base_map, diff_ramp_map, base_sampler,
// ramp_sampler) — include it after the bindings fragment.

// HGRP diffuse ramps are 256x1 LUTs indexed by half-Lambert n.l; sample half a texel away
// from the edges so clamp addressing doesn't bleed the outermost texels.
fn hgrp_ramp_u(ndotl: f32) -> f32 {
    return clamp(ndotl * 0.5 + 0.5, 1.0 / 512.0, 1.0 - 1.0 / 512.0);
}

// BaseMap x DiffRamp shading shared by all variants; variant features (SDF face shadow,
// matcap, rim, spec ramp, hair aniso) layer on top of this in their own fs_main.
fn hgrp_shade_base(uv0: vec2<f32>, world_normal: vec3<f32>) -> vec4<f32> {
    let base = textureSample(base_map, base_sampler, uv0) * hgrp_material.base_color;

    if hgrp_material.alpha_cutoff > 0.0 && base.a < hgrp_material.alpha_cutoff {
        discard;
    }

    let n = normalize(world_normal);
    let ndotl = dot(n, normalize(MAIN_LIGHT_DIRECTION));

    let ramp = textureSample(diff_ramp_map, ramp_sampler, vec2<f32>(hgrp_ramp_u(ndotl), 0.5)).rgb;

    // Materials that disable the ramp fall back to a floored half-Lambert so they stay
    // readable without the game's full lighting stack.
    let half_lambert = clamp(ndotl * 0.5 + 0.5, 0.35, 1.0);
    let lit = select(vec3<f32>(half_lambert), ramp, hgrp_material.use_diff_ramp > 0.5);

    return vec4<f32>(base.rgb * lit, base.a);
}
