// Fur dye subsystem (_FurDyeEnable, the game's _CHARACTER_FUR_DYE keyword; formulas §6.2): the
// dye map screened into the base color ahead of the shade blend, weighted by _FurDyeIntensity.
// The dye map is read over the un-tiled uv0 — the material's _BaseMap_ST undone — with its own
// _ST. Off-stub: the base color as is.
fn hgrp_fur_dye(albedo: vec3<f32>, uv0: vec2<f32>) -> vec3<f32> {
    let base_st = hgrp_material.base_map_st;
    let dye_st = hgrp_material.fur_dye_map_st;
    let uv = ((uv0 - base_st.zw) / max(abs(base_st.xy), vec2<f32>(0.001))) * dye_st.xy + dye_st.zw;
    let dye = textureSample(fur_dye_map, base_sampler, uv).rgb;
    return mix(albedo, 1.0 - (1.0 - albedo) * (1.0 - dye), hgrp_material.fur_dye_intensity);
}
