// Shared HGRP NPR shading core. References the common HGRP bindings (hgrp_material, base_map,
// base_sampler, ramp_sampler — declared by the permutation's generated group-2 fragment;
// scene_lighting from group 3), the HSV helpers from math/color.wgsl, and the subsystem hooks
// (lighting/hgrp/*.wgsl, or their generated off-stubs): hgrp_shadow_color, hgrp_shade_coord,
// hgrp_ramp_weight.
//
// Shading model derived from the ripped data (renderer-material-family.md, hgrp-pipeline.md):
// the 256x1 DiffRamp holds per-channel blend weights between a shadow color and the base
// color — black below the terminator, a warm transition band, white on the lit side — so
// `mix(shadow_color, base, ramp)` reproduces the tinted terminator without ever multiplying
// the dark side to black. The shadow color comes from a 32^3 color-grading LUT
// (_UseShadowLutTex) or an HSV adjustment of the base color
// (_ShadowColorBrightness/_ShadowColorSaturation) for everything else. The ramp coordinate
// is half-Lambert n.l by default; the SDF subsystem substitutes its face-shadow factor.

// Scene lighting (renderer/sceneSettings.ts): the one key light every n.l, SDF threshold and
// half vector reads, and a hemisphere ambient (sky above, ground below — Unity's gradient
// ambient, a stand-in for the game's spherical harmonics) that each variant adds on top of
// the key-lit color: albedo x hemisphere(normal). The ripped materials carry no scene light,
// so all of it is calibration knobs; the ambient is what keeps metallic zones (silver
// fabric) from going black where the key light does not reach, and its up/down gradient is
// what lets a normal-mapped quilt read under ambient alone.
fn hgrp_light_dir() -> vec3<f32> {
    return normalize(scene_lighting.light_dir.xyz);
}

fn hgrp_hemisphere(direction: vec3<f32>) -> vec3<f32> {
    return mix(
        scene_lighting.ambient_ground.rgb,
        scene_lighting.ambient_sky.rgb,
        direction.y * 0.5 + 0.5,
    );
}

fn hgrp_ambient(albedo: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
    return albedo * hgrp_hemisphere(n);
}

// HGRP diffuse ramps are 256x1 LUTs; sample half a texel away from the edges so clamp
// addressing doesn't bleed the outermost texels.
fn hgrp_ramp_inset(u: f32) -> f32 {
    return clamp(u, 1.0 / 512.0, 1.0 - 1.0 / 512.0);
}

// Base sample with alpha clip (alpha_cutoff 0 = disabled).
fn hgrp_base_color(uv0: vec2<f32>) -> vec4<f32> {
    let base = textureSample(base_map, base_sampler, uv0) * hgrp_material.base_color;
    if hgrp_material.alpha_cutoff > 0.0 && base.a < hgrp_material.alpha_cutoff {
        discard;
    }
    return base;
}

// Shadow color for materials without a LUT: HSV-adjusted base color (the classic anime
// shadow: darker, slightly more saturated).
fn hgrp_hsv_shadow_color(base: vec3<f32>, brightness: f32, saturation: f32) -> vec3<f32> {
    var hsv = rgb_to_hsv(base);
    hsv.y = clamp(hsv.y * saturation, 0.0, 1.0);
    hsv.z = hsv.z * brightness;
    return hsv_to_rgb(hsv);
}

// Screen-space depth rim (the game's rim family: its opaque materials carry _ZTest Equal —
// evidence of a completed depth prepass — and a thin depth-tested edge is the only rim
// formula where the official _ColorAdjustmentRimIntensity 4.0 is sane; the released value
// on a broad fresnel band flooded every silhouette white). The fragment offsets its screen
// position along the view-space normal by _ColorAdjustmentRimWidth-scaled pixels and reads
// the prepass depth: an edge is a neighbour that sits a real GAP behind this surface.
//
// The gap test runs on LINEARIZED view distances with a world-unit threshold: raw depth is
// hyperbolic, so any fixed raw threshold small enough to catch edges also fires on a curved
// surface's own recession toward grazing angles (first check whitewashed hair/cloth — thin
// hair cards additionally need the offset to stay small, a few px, or every fragment's
// sample escapes its own card). Pixel scale and gap are v1 calibration constants; the gap
// is in asset metres (5 cm on the model) and follows the draw's world scale at use.
const HGRP_RIM_WIDTH_PX: f32 = 4.0;
const HGRP_RIM_DEPTH_GAP: f32 = 0.05;

// Raw depth -> positive view distance, inverted from the perspective projection
// (clip.z = m22 * z_view + m32, w = -z_view, so distance = m32 / (depth + m22)).
fn hgrp_view_distance(depth: f32) -> f32 {
    let m22 = mvp.projection_matrix[2][2];
    let m32 = mvp.projection_matrix[3][2];
    return m32 / (depth + m22);
}

fn hgrp_rim(n: vec3<f32>, frag_coord: vec4<f32>, ndotl: f32) -> vec3<f32> {
    let n_view = (mvp.view_matrix * vec4<f32>(n, 0.0)).xyz;
    // framebuffer y grows downward, view-space y grows upward
    let dir = vec2<f32>(n_view.x, -n_view.y);
    let dir_len = max(length(dir), 0.0001);
    let offset = dir * ((hgrp_material.rim_width * HGRP_RIM_WIDTH_PX) / dir_len);

    let dims = vec2<f32>(textureDimensions(scene_depth));
    let coord = clamp(frag_coord.xy + offset, vec2<f32>(0.0), dims - vec2<f32>(1.0));
    let neighbour_depth = textureLoad(scene_depth, vec2<i32>(coord), 0);
    let gap = hgrp_view_distance(neighbour_depth) - hgrp_view_distance(frag_coord.z);
    let edge = step(HGRP_RIM_DEPTH_GAP * hgrp_model_scale(), gap);

    let light_side = clamp(ndotl * 0.5 + 0.5, 0.0, 1.0);
    return hgrp_material.rim_color.rgb * (edge * hgrp_material.rim_intensity * light_side);
}

// Result of the shading core: the key-lit color (shade blend x key light, plus rim) and the
// albedo it was shaded from, so a variant can add the ambient term (hgrp_ambient) and, for
// metal, decide separately what the key light and the ambient do to the diffuse.
struct HGRPShade {
    lit: vec3<f32>,
    albedo: vec3<f32>,
    alpha: f32,
}

// Base + shadow-blend + rim composition. `n_ramp` drives the shade coordinate (the ramp's
// n.l); `n_rim` the screen-space rim. Cloth and hair pass the geometric normal as n_ramp: their
// ramps are near-steps (cloth 0.2 -> 0.9 at x 0.6, hair black until 0.5), and a normal-mapped
// n.l scatters neighbouring texels across the step into blotches, where the in-game diffuse
// is continuous — the normal map shapes specular and rim there, not the terminator. Skin
// keeps the mapped normal on its smooth ramp. The shadow color, the shade coordinate and the
// ramp weight come from the permutation's hooks. The shade coordinate hook also returns the
// SDF mask's cheek-tint weight (0 without the SDF subsystem): _SDFRimColor multiplies the
// shade blend where the coordinate crosses the terminator inside that zone — the anime
// cheek-shadow tint, not a rim light.
fn hgrp_shade_core(
    uv0: vec2<f32>,
    n_ramp: vec3<f32>,
    n_rim: vec3<f32>,
    frag_coord: vec4<f32>,
) -> HGRPShade {
    let base = hgrp_base_color(uv0);
    let ndotl = dot(n_ramp, hgrp_light_dir());

    let shadow_color = hgrp_shadow_color(base.rgb);
    let shade = hgrp_shade_coord(uv0, ndotl);
    let w = hgrp_ramp_weight(shade.x);

    let terminator = 4.0 * shade.x * (1.0 - shade.x);
    let tint = mix(
        vec3<f32>(1.0),
        hgrp_material.sdf_rim_color.rgb,
        shade.y * terminator * hgrp_material.sdf_rim_color.a,
    );

    let rim = hgrp_rim(n_rim, frag_coord, ndotl);

    let lit = mix(shadow_color, base.rgb, w) * tint * scene_lighting.light.rgb;
    return HGRPShade(lit + rim, base.rgb, base.a);
}
