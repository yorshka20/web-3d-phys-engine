// Hair strand-line subsystem (_UseLineMap): the strand pattern that the hair shader's third
// Kajiya-Kay lobe darkens and desaturates (hgrp-decompiled-formulas.md §3) — 1 - _LineMap.r at
// uv x _LineMap_ST.xy + .zw; every row of the map is the same 1-D pattern of thin bright lines
// (probed 2026-09-01), so the lines run along the strands. Off-stub: the game's mapless square
// wave along u, ceil(sat(frac(u x _LineAmount) - 0.5)).
fn hgrp_hair_line_pattern(uv0: vec2<f32>) -> f32 {
    let st = hgrp_material.line_map_st;
    return 1.0 - textureSample(line_map, base_sampler, uv0 * st.xy + st.zw).r;
}
