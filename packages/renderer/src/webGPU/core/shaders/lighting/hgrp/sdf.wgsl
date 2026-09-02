// SDF face shadow subsystem (_UseSDFLightmap), v2. The ramp coordinate is the SDF face-shadow
// factor instead of half-Lambert n.l, so the ramp's warm terminator lands exactly on the SDF
// boundary. _SDFLightmap.R holds the light-yaw threshold field for one side; the other side
// samples mirrored UVs (G/B/A unread, see hgrp-shading.md). Head axes come from the model
// matrix (guess ledger D5: the head bone once skinning drives it).
//
// _SDFMask (cm_M), probed on the face mesh 2026-09-02: R is a soft radial weight, 0 at the
// front centre of the face and 1 toward the sides and back — read as the SDF's authority, so
// shading falls back to the geometric half-Lambert where the field has none (ears, jaw
// underside). A marks two symmetric diagonal cheek bands plus the nose tip (10% of the face
// vertices, at cheekbone height) — read as the zone where _SDFRimColor tints the terminator
// (a dusty pink darker than skin is a shadow-edge tint, not a rim light). G/B are hard
// side/back masks, unread. Returns (shade coordinate, cheek tint weight).
// Off-stub: (half-Lambert, 0).
fn hgrp_shade_coord(uv0: vec2<f32>, ndotl: f32) -> vec2<f32> {
    let head_forward = normalize((mvp.model_matrix * vec4<f32>(0.0, 0.0, 1.0, 0.0)).xyz);
    let head_right = normalize((mvp.model_matrix * vec4<f32>(1.0, 0.0, 0.0, 0.0)).xyz);
    let light = normalize(MAIN_LIGHT_DIRECTION);

    let lx = dot(light, head_right);
    let lz = dot(light, head_forward);
    // 0 = light dead ahead, 1 = light directly behind (horizontal sweep only)
    let threshold = atan2(abs(lx), lz) / PI;

    let uv_sdf = select(vec2<f32>(1.0 - uv0.x, uv0.y), uv0, lx >= 0.0);
    let sdf = textureSample(sdf_lightmap, ramp_sampler, uv_sdf).r;
    let sdf_lit = smoothstep(threshold - 0.05, threshold + 0.05, sdf);

    let mask = textureSample(sdf_mask, base_sampler, uv0);
    return vec2<f32>(mix(sdf_lit, ndotl * 0.5 + 0.5, mask.r), mask.a);
}
