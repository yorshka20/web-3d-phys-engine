// Shared HGRP NPR shading core. References the common HGRP bindings (hgrp_material, base_map,
// base_sampler, ramp_sampler — declared by the permutation's generated group-2 fragment;
// scene_lighting from group 3), the sRGB helpers from math/color.wgsl, and the subsystem hooks
// (lighting/hgrp/*.wgsl, or their generated off-stubs): hgrp_shadow_color, hgrp_shade_coord,
// hgrp_ramp, hgrp_metallic_gloss, hgrp_spec_ramp_color.
//
// Shading model: the decompiled character shader (learnings hgrp-decompiled-formulas.md,
// §1 Standard — the section numbers below refer to it). The shaded color is a lighting
// multiplier light(N) times a shade blend col'. The blend picks between the albedo, a shadow
// color and a deep-shadow color by the diffuse ramp's ALPHA capped by the surface map's
// occlusion, and light(N) carries the key light's luma on both sides of the terminator plus a
// hemisphere-shaped environment color — so the dark side sits at its shadow color under the
// same light as the lit side, never at black, and the terminator's hue comes from the ramp's
// rgb. On top, a GGX specular with the shader's stylized half vector and a split-sum IBL with
// multiple-scattering compensation, both scaled by the same lit weight. The shadow color comes
// from a 32^3 color-grading LUT (_UseShadowLutTex) or a luminance/saturation adjustment of the
// base color for everything else. The ramp coordinate is n.l biased by _CharacterParams11.w;
// the SDF subsystem substitutes its face-shadow factor.

// Rec.709 luma weights of the decompiled shader (§0).
const HGRP_LUMA: vec3<f32> = vec3<f32>(0.212673, 0.715152, 0.072175);

fn hgrp_luma(c: vec3<f32>) -> f32 {
    return dot(c, HGRP_LUMA);
}

fn hgrp_light_dir() -> vec3<f32> {
    return normalize(scene_lighting.light_dir.xyz);
}

// The view axis toward the camera (the shader's `camDir`, InvView x (0, 0, 1)): the
// view-dependent ramp and the stylized half vector read it in place of the per-fragment view
// vector.
fn hgrp_cam_dir() -> vec3<f32> {
    return -normalize(mvp.camera_forward);
}

// The material's object frame in world space (rotation and scale): the model matrix, composed
// with the posed frame of the joint the material names — hgrp_material.object_frame_joint,
// -1 for the model's own frame. The face shader reads the light and the camera in this frame
// for the SDF face shadow and the highlight offset (§2); in the game that frame is the face
// renderer's root bone, the head, so the shadow turns with the head (guess ledger D5). The
// palette entry maps bind-pose model space to posed model space, so the bind-pose axes come
// out as the posed head's axes.
fn hgrp_object_to_world() -> mat3x3<f32> {
    let model = mat3x3<f32>(
        mvp.model_matrix[0].xyz,
        mvp.model_matrix[1].xyz,
        mvp.model_matrix[2].xyz,
    );
    let joint = i32(hgrp_material.object_frame_joint);
    if joint < 0 {
        return model;
    }
    let palette = joint_matrices[u32(joint)];
    return model * mat3x3<f32>(palette[0].xyz, palette[1].xyz, palette[2].xyz);
}

// Horizontal projection of a normal, the hemisphere input of the skin and eye shaders (§2,
// §4) — with the captured axis it makes their environment term a constant 0.725. The tiny y
// is the decompiled shader's own guard against a vertical normal normalizing to NaN.
fn hgrp_horizontal(n: vec3<f32>) -> vec3<f32> {
    return normalize(vec3<f32>(n.x, 6.1e-5, n.z));
}

// Hemisphere shape of the environment term (§1.4): clamp(n.P6 + P7.x, 0, 1) x P7.y + P7.z —
// 2.225 facing up, 0.725 horizontal, 0.5 facing down.
fn hgrp_hemi(n: vec3<f32>) -> f32 {
    let p7 = scene_lighting.hemi_params.xyz;
    return clamp(dot(n, scene_lighting.hemi_axis.xyz) + p7.x, 0.0, 1.0) * p7.y + p7.z;
}

// light(N) (§1.8), the multiplier on the shade blend. The key light contributes its luma on
// both sides of the terminator and its chroma only on the lit side (w2); the environment
// contributes its color shaped by the hemisphere, intensity clamped at 1.5; P0.y scales the
// sum. `hemi_n` is the normal the hemisphere reads and `env_color` is P2 — or, for skin, P3.
// With a white key light the first term is a constant, so light(N) is nearly flat and the
// shading comes from the shade blend — the hemisphere only breathes with the environment
// intensity, which is why that intensity decides whether up-facing cloth saturates.
fn hgrp_light(hemi_n: vec3<f32>, env_color: vec3<f32>, w2: f32) -> vec3<f32> {
    let lc = scene_lighting.light_color.rgb;
    let env_intensity = clamp(scene_lighting.light_color.w, 0.0, 1.5);
    let key = mix(vec3<f32>(hgrp_luma(lc)), lc, w2);
    return (key + env_color * (hgrp_hemi(hemi_n) * env_intensity)) *
        scene_lighting.character_params0.y;
}

// Shadow color for materials without a LUT (§1.6): the base color darkened by
// _ShadowColorBrightness, then its saturation scaled by _ShadowColorSaturation around its own
// luma — in linear RGB, not HSV. The outline and hair-line colors use the same adjustment.
fn hgrp_shadow_color_adjust(base: vec3<f32>, brightness: f32, saturation: f32) -> vec3<f32> {
    let sc = base * brightness;
    return mix(vec3<f32>(hgrp_luma(sc)), sc, saturation);
}

// Result of the shade blend: col' and the lit weight w2 the lighting multiplier, the specular
// term and the IBL all read.
struct HGRPBlend {
    col: vec3<f32>,
    w2: f32,
}

// col' (§1.7), the shade blend. w2 = min(ao, ramp.a) is the lit weight: the ramp's alpha
// capped by the surface map's occlusion (B, the authored shadow of seams and folds). Three
// tiers: the albedo where w2 is high, the shadow color (x P0.z) below the terminator, and a
// deep shadow — 0.65 x shadow, saturation x 1.2 — only where the view ramp is dark as well
// (surfaces turned away from both light and camera, or occluded). The ramp's rgb then tints
// the result, weighted by its own chroma and normalized back to the untinted luma (ratio
// clamped at 1.5), so a grey ramp is a no-op and a warm one only recolors. kd = 0.96 (1 - m)
// is the diffuse fraction: a metal has none, its look comes from the IBL.
fn hgrp_shade_blend(
    albedo: vec3<f32>,
    shadow_color: vec3<f32>,
    ramp: vec4<f32>,
    ramp_view: f32,
    ao: f32,
    metallic: f32,
) -> HGRPBlend {
    let kd = 0.96 * (1.0 - metallic);
    let w2 = min(ao, ramp.a);
    let albedo_d = albedo * kd;
    let shadow = shadow_color * (kd * scene_lighting.character_params0.z);
    let deep_base = shadow * 0.65;
    let deep = mix(vec3<f32>(hgrp_luma(deep_base)), deep_base, 1.2);
    let col = mix(mix(deep, shadow, clamp(ao * ramp_view + ramp.a, 0.0, 1.0)), albedo_d, w2);
    let chroma = max(ramp.r, max(ramp.g, ramp.b)) - min(ramp.r, min(ramp.g, ramp.b));
    let tinted = col * mix(vec3<f32>(1.0), ramp.rgb, chroma);
    let normalized = tinted * clamp(hgrp_luma(col) / max(hgrp_luma(tinted), 0.001), 0.0, 1.5);
    return HGRPBlend(normalized, w2);
}

// Saturation lift of the bright range (§1.11), applied to diffuse + specular before the
// additive terms: c' = l + (1 + k^2)(c - l), k = clamp(l - 0.5, 0, 0.5) — a pixel at luma 1
// gains 25% saturation, anything below 0.5 is untouched.
fn hgrp_bright_saturation(c: vec3<f32>) -> vec3<f32> {
    let l = hgrp_luma(c);
    let k = clamp(l - 0.5, 0.0, 0.5);
    return vec3<f32>(l) + (c - vec3<f32>(l)) * (1.0 + k * k);
}

// --- Specular (§1.9) -------------------------------------------------------------------

// The stylized half vector: L + 2 x normalize(camDir.x, L.y, camDir.z) + 3 V. The middle term
// is the camera axis lifted to the light's elevation, so the highlight sits where a
// camera-facing light would put it and only slides with the real light's height.
fn hgrp_half_vector(view_dir: vec3<f32>) -> vec3<f32> {
    let l = hgrp_light_dir();
    let cam = hgrp_cam_dir();
    return normalize(l + 2.0 * normalize(vec3<f32>(cam.x, l.y, cam.z)) + 3.0 * view_dir);
}

// GGX alpha = roughness^2, floored at 1/128 so a mirror-smooth surface keeps a visible lobe.
fn hgrp_ggx_alpha(roughness: f32) -> f32 {
    return max(roughness * roughness, 1.0 / 128.0);
}

// GGX normal distribution D = alpha^2 / (n.h^2 (alpha^2 - 1) + 1)^2, with the decompiled
// shader's own divide guard.
fn hgrp_ggx_d(ndoth: f32, alpha: f32) -> f32 {
    let a2 = alpha * alpha;
    let denom = ndoth * ndoth * (a2 - 1.0) + 1.0;
    let d2 = denom * denom;
    return select(1.0, a2 / d2, a2 != d2);
}

// The scalar specular term: D x 0.5 / (2 n.v + alpha) — the shader's visibility approximation
// — minus a tiny offset that zeroes the lobe's far tail, clamped at 20.
fn hgrp_spec_term(d: f32, alpha: f32, ndotv: f32) -> f32 {
    return clamp(d * (0.5 / (2.0 * ndotv + alpha + 1e-4)) - 6.1e-5, 0.0, 20.0);
}

// Shadow-side attenuation shared by the specular and the IBL: (0.5 + 0.5 w2)(P0.z + (1 - P0.z) w2),
// a highlight in shadow keeps 40% of its strength.
fn hgrp_shade_spec(w2: f32) -> f32 {
    return (0.5 * w2 + 0.5) * mix(scene_lighting.character_params0.z, 1.0, w2);
}

// --- Image-based lighting (§1.10) ----------------------------------------------------------

// The environment the IBL reflects, standing in for the character cubemap the rip did not
// carry: a grey hemisphere with sceneSettings.envGradient up/down contrast at
// sceneSettings.envRadiance. The IBL multiplies it by the environment color (P2) the way the
// shader multiplies its cubemap.
fn hgrp_env_stand_in(dir: vec3<f32>) -> vec3<f32> {
    let gradient = scene_lighting.env_stand_in.x;
    let radiance = scene_lighting.env_stand_in.y;
    return vec3<f32>(mix(1.0 - gradient, 1.0 + gradient, dir.y * 0.5 + 0.5) * radiance);
}

// The split-sum environment BRDF as the decompiled shader fits it: two rational functions of
// n.v and roughness giving the F0 scale A and the bias B (specular = cube x (F0 A + B)).
// Coefficients transcribed from cloth variant b451 lines 968-969.
fn hgrp_env_brdf(ndotv: f32, roughness: f32) -> vec2<f32> {
    let nv2 = ndotv * ndotv;
    let nv3 = nv2 * ndotv;
    let r2 = roughness * roughness;
    let r6 = r2 * r2 * r2;
    let a_num = (0.0365463 + 3.32707 * ndotv) + (9.0632 - 9.04756 * ndotv) * r2;
    let a_den = (1.0 + 3.59685 * nv2 - 1.36772 * nv3) +
        (9.04401 - 16.3174 * nv2 + 9.22949 * nv3) * r2 +
        (5.56589 + 19.7886 * nv2 - 20.2123 * nv3) * r6;
    let b_num = (0.99044 - 1.28514 * ndotv) + (1.29678 - 0.755907 * ndotv) * r2;
    let b_den = (1.0 + 2.92338 * ndotv + 59.4188 * nv3) +
        (20.3225 - 27.0302 * ndotv + 222.592 * nv3) * r2 +
        (121.563 + 626.13 * ndotv + 316.627 * nv3) * r6;
    return vec2<f32>(a_num / a_den, b_num / b_den);
}

// IBL specular for every material, weighted by its F0 (metal reflects its albedo, a dielectric
// 4% x its specular amount): cube x (F0 A + B) x (1 + F0 (1 - E) / E) — the last factor is the
// multiple-scattering energy compensation, E = A + B — x the environment intensity clamped to
// [0.5, 1.5] x P0.w x the shadow-side floor lerp(P0.z, 1, w2) x the environment color. The
// _SpecRampIridescentMode blend of F0 with the spec ramp is left out: the parameter is 0 in
// every preset (param ledger).
fn hgrp_ibl(
    f0: vec3<f32>,
    roughness: f32,
    ndotv: f32,
    n: vec3<f32>,
    view_dir: vec3<f32>,
    w2: f32,
    env_color: vec3<f32>,
) -> vec3<f32> {
    let ab = hgrp_env_brdf(ndotv, roughness);
    let e = ab.x + ab.y;
    let brdf = (f0 * ab.x + vec3<f32>(ab.y)) * (vec3<f32>(1.0) + f0 * ((1.0 - e) / e));
    let cube = hgrp_env_stand_in(reflect(-view_dir, n));
    let env_intensity = clamp(scene_lighting.light_color.w, 0.5, 1.5);
    let p0 = scene_lighting.character_params0;
    return cube * brdf * (env_intensity * p0.w * mix(p0.z, 1.0, w2)) * env_color;
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

// A two-channel tangent-space normal (the halves of the hair's _SplitNormalMap): z rebuilt from
// xy before the scale is applied, as the decompiled shader does, then taken to world space.
fn hgrp_split_normal(tbn: mat3x3<f32>, encoded: vec2<f32>, scale: f32) -> vec3<f32> {
    let xy = encoded * 2.0 - 1.0;
    let z = max(1e-8, sqrt(1.0 - clamp(dot(xy, xy), 0.0, 1.0)));
    return normalize(tbn * vec3<f32>(xy * scale, z));
}

// Result of the shading core: the shaded color light(N) x col', the lighting multiplier
// light(N) on its own, the albedo after the SDF tint (what F0 reads) and the alpha, the lit
// weight w2 (the specular attenuation and the IBL read it) and the specular gate (the SDF
// mask's G on the face, 1 elsewhere) that scales the dielectric F0.
struct HGRPShade {
    lit: vec3<f32>,
    light: vec3<f32>,
    albedo: vec3<f32>,
    alpha: f32,
    w2: f32,
    spec_gate: f32,
}

// Base + shade blend + lighting for a given (already normalized) shading normal `n`, the
// normal the hemisphere reads (`hemi_n`), the variant's environment color and its surface
// parameters (hgrp_metallic_gloss: metallic, specular, occlusion, smoothness). The shadow
// color, the shade value and the ramp come from the permutation's hooks. The shadow color is
// graded from the untinted albedo; the SDF subsystem's _SDFRimColor tint applies to the albedo
// the lit tier and F0 read (§2).
fn hgrp_shade_core(
    uv0: vec2<f32>,
    n: vec3<f32>,
    hemi_n: vec3<f32>,
    env_color: vec3<f32>,
    surface: vec4<f32>,
    view_dir: vec3<f32>,
) -> HGRPShade {
    let base = hgrp_base_color(uv0);
    let ndotl = dot(n, hgrp_light_dir());
    // §1.5: the ramp reads n.l biased by _CharacterParams11.w, clamped to [-1, 1]
    let shade_nl = clamp(ndotl + scene_lighting.light_dir.w, -1.0, 1.0);
    let shade = hgrp_shade_coord(uv0, shade_nl, n, view_dir);
    let ramp = hgrp_ramp(shade.x);
    let ramp_view = hgrp_ramp(dot(n, hgrp_cam_dir())).a;

    let shadow_color = hgrp_shadow_color(base.rgb);
    let albedo = base.rgb * mix(vec3<f32>(1.0), hgrp_material.sdf_rim_color.rgb, shade.y);
    let blend = hgrp_shade_blend(albedo, shadow_color, ramp, ramp_view, surface.b, surface.r);
    let light = hgrp_light(hemi_n, env_color, blend.w2);
    return HGRPShade(light * blend.col, light, albedo, base.a, blend.w2, shade.z);
}
