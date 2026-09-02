// Emission subsystem (_UseEmission): _EmissionMap x _EmissionColor x _EmissionBrightness,
// HDR-scaled (8-30 in presets; the tonemap shoulder absorbs it). Off-stub: black.
fn hgrp_emission(uv0: vec2<f32>) -> vec3<f32> {
    return textureSample(emission_map, base_sampler, uv0).rgb *
        hgrp_material.emission_color.rgb * hgrp_material.emission_brightness;
}
