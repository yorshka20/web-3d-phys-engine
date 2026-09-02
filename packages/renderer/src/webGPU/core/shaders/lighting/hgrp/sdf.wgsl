// SDF face shadow subsystem (_UseSDFLightmap), v1 — channel semantics still under calibration
// (see hgrp-shading.md). The ramp coordinate is the SDF face-shadow factor instead of
// half-Lambert n.l, so the ramp's warm terminator lands exactly on the SDF boundary. R holds
// the light-yaw threshold field for one side; the other side samples mirrored UVs. Head axes
// come from the model matrix. _SDFMask is bound with this subsystem but not consumed yet
// (HGRP_UNIMPLEMENTED_SLOTS). Off-stub: half-Lambert.
fn hgrp_shade_coord(uv0: vec2<f32>, ndotl: f32) -> f32 {
    let head_forward = normalize((mvp.model_matrix * vec4<f32>(0.0, 0.0, 1.0, 0.0)).xyz);
    let head_right = normalize((mvp.model_matrix * vec4<f32>(1.0, 0.0, 0.0, 0.0)).xyz);
    let light = normalize(MAIN_LIGHT_DIRECTION);

    let lx = dot(light, head_right);
    let lz = dot(light, head_forward);
    // 0 = light dead ahead, 1 = light directly behind (horizontal sweep only)
    let threshold = atan2(abs(lx), lz) / PI;

    let uv_sdf = select(vec2<f32>(1.0 - uv0.x, uv0.y), uv0, lx >= 0.0);
    let sdf = textureSample(sdf_lightmap, ramp_sampler, uv_sdf).r;

    return smoothstep(threshold - 0.05, threshold + 0.05, sdf);
}
