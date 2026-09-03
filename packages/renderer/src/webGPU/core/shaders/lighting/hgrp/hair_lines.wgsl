// Hair strand-line subsystem (_UseLineMap). The LineMap is a 1D strand-intensity pattern
// (every row identical — thin bright lines on black, probed 2026-09-01), tiled across the
// strand axis (uv.x; base_sampler wraps). The lines darken/desaturate the shaded color through
// the same luminance/saturation adjustment as the shadow color. _LineAmount anchors at the preset value
// 300 = 1x tiling (v1 assumption). Off-stub: the shaded color unchanged.
fn hgrp_hair_lines(shaded: vec3<f32>, uv0: vec2<f32>) -> vec3<f32> {
    let tiling = hgrp_material.line_amount * (1.0 / 300.0);
    let line = textureSample(line_map, base_sampler, vec2<f32>(uv0.x * tiling, uv0.y)).r;
    let line_color = hgrp_shadow_color_adjust(
        shaded,
        hgrp_material.line_value,
        hgrp_material.line_saturation,
    );
    let mask = smoothstep(1.0 - hgrp_material.line_range, 1.0, line) * hgrp_material.line_intensity;
    return mix(shaded, line_color, clamp(mask, 0.0, 1.0));
}
