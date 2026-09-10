// The character light rig's additional lights (hgrp-decompiled-formulas.md §1.11): the point
// and spot lights of a character's Character Info rig, each shading through one of four
// "character light type" formulas rather than as a physical light. Transcribed from the cloth
// variant b451 lines 1029-1330; the skin, hair and eye variants carry the same loop.
//
// What is left out, with the reason: the light's culling box and cookie (their data is a packed
// half-float matrix the rip's C# side owns), the shadow map (we have none — the loop's own
// no-shadow-map fallback stands in), the light-binning tile lookup (we walk the rig instead)
// and the line/area light branch (every light in the rig is `shape 0`, punctual).

const HGRP_LIGHT_DIFFUSE: f32 = 0.0;
const HGRP_LIGHT_RAMP: f32 = 1.0;
const HGRP_LIGHT_SPECULAR: f32 = 2.0;
const HGRP_LIGHT_RIM: f32 = 3.0;
const HGRP_LIGHT_FOG: f32 = 4.0;

// What a variant's shading hands the loop. The diffuse tiers and the specular color are the
// ones the key light already read, so an additional light differs from it only in light(N).
struct HGRPPunctualInputs {
    world_position: vec3<f32>,
    // The shading normal: the ramp coordinate, the rim and the specular all read it
    n: vec3<f32>,
    // The geometric normal, which only the fog light's directional falloff reads
    geom_n: vec3<f32>,
    view_dir: vec3<f32>,
    ndotv: f32,
    // The shade blend (col') — the diffuse color a lighting-type light multiplies
    col: vec3<f32>,
    albedo_d: vec3<f32>,
    shadow_d: vec3<f32>,
    // F0 x the spec ramp color, as the GGX lobe of the key light uses it
    spec_color: vec3<f32>,
    // GGX alpha = max(roughness^2, 1/128), and the roughness the type-2 gate compares
    ggx_alpha: f32,
    roughness: f32,
    metallic: f32,
}

// Distance falloff. A negative exponent (1372 of the roster's 1634 lights) selects the URP
// curve — rangeless 1/(d^2+1) shaped by a range window — and a non-negative one the
// exponential window the fog lights use.
fn hgrp_punctual_falloff(dist2: f32, range: f32, exponent: f32) -> f32 {
    let ratio = dist2 / max(range * range, 1e-6);
    if exponent < 0.0 {
        let window = clamp(1.0 - ratio * ratio, 0.0, 1.0);
        return (window * window) / (dist2 + 1.0);
    }
    return pow(clamp(1.0 - ratio, 0.0, 1.0), exponent);
}

// Adds every light of the rig to an already-shaded pixel. The fog type is the reason this takes
// and returns the color rather than returning a sum: it lerps the pixel toward its own color,
// which the game applies in rig order among the additive ones.
fn hgrp_punctual_lights(shaded: vec3<f32>, s: HGRPPunctualInputs) -> vec3<f32> {
    var color = shaded;
    let count = u32(max(scene_lighting.env_stand_in.w, 0.0));
    let cam = hgrp_cam_dir();
    let from_center = normalize(s.world_position - hgrp_object_origin());
    let nv_abs = abs(dot(s.n, s.view_dir));

    // A light's range and its falloff curve are authored in the asset's metre space, while its
    // position is where the stage put it, so the distance converts before it is used — the same
    // rule every HGRP length follows (core/hgrp_transform.wgsl). Without it the rangeless
    // 1/(d^2+1) term would shrink with the stage's scale.
    let inv_scale2 = 1.0 / max(hgrp_model_scale() * hgrp_model_scale(), 1e-8);

    for (var i = 0u; i < count; i = i + 1u) {
        let light = punctual_lights[i];
        let to_light = light.position_range.xyz - s.world_position;
        let dist2 = dot(to_light, to_light) * inv_scale2;
        let range = light.position_range.w;
        if dist2 > range * range {
            continue;
        }
        let l = normalize(to_light);
        let npr_type = light.spot_scale_type.y;
        let p = light.npr_params;

        // The fog type replaces the falloff exponent with twice its falloff factor
        var exponent = light.color_falloff.w;
        if npr_type == HGRP_LIGHT_FOG {
            exponent = max(2.0 * p.y, 0.1);
        }
        var atten = hgrp_punctual_falloff(dist2, range, exponent);
        if light.spot_scale_type.w > 0.5 {
            let cone = clamp(
                (dot(l, -light.spot_dir_cos_outer.xyz) - light.spot_dir_cos_outer.w) *
                    light.spot_scale_type.x,
                0.0,
                1.0,
            );
            atten = atten * cone * cone;
        }
        if atten < 1e-4 {
            continue;
        }

        // The loop's shadow term where no shadow map covers the light: the far side of the body
        // relative to the light, from the draw's own origin.
        let shadow = clamp(dot(from_center, l) + 1.0, 0.0, 1.0);
        let ndotl = dot(s.n, l);
        let ndotl_sat = clamp(ndotl, 0.0, 1.0);

        if npr_type == HGRP_LIGHT_FOG {
            // A volumetric-fog stand-in: the whole pixel lerps to the light's color, optionally
            // weighted by how much the surface faces the light (p.w, the fog ramp bias)
            let facing = smoothstep(-0.5, 0.5, dot(s.geom_n, l));
            let weight = atten * (p.x * ((1.0 - p.w) + facing * p.w));
            color = mix(color, light.color_falloff.rgb, clamp(weight, 0.0, 1.0));
            continue;
        }

        var radiance = light.color_falloff.rgb;
        var reach = atten;
        var weight = 0.0;
        var tier_lo = vec3<f32>(0.0);
        var tier_hi = vec3<f32>(0.0);
        var spec_gate = 1.0;
        var roughness_bias = 0.0;

        if npr_type == HGRP_LIGHT_DIFFUSE {
            // p.x contrast: how much of the light survives on the far side of the terminator.
            // p.y auto-limit: normalizes a light whose peak exceeds 1 so a bright fill does not
            // blow the pixel out.
            let peak = radiance * atten;
            let limit = 1.0 / max(1.0, max(peak.r, max(peak.g, peak.b)) * 0.75);
            radiance = radiance * ((1.0 - p.y) + limit * p.y) *
                mix(0.25 * p.x, 1.0, clamp(ndotl + 0.5, 0.0, 1.0));
            weight = ndotl_sat;
            tier_lo = s.col;
            tier_hi = s.col;
        } else if npr_type == HGRP_LIGHT_RAMP {
            // A plain diffuse light between the shade blend's two tiers, biased by p.x
            weight = clamp(clamp(ndotl + p.x, -1.0, 1.0), 0.0, 1.0) * shadow;
            tier_lo = s.shadow_d * p.y;
            tier_hi = s.albedo_d;
        } else if npr_type == HGRP_LIGHT_RIM {
            // A rim ring on the side the light comes from, gated to grazing view by p.x (the
            // rim width) and colored between grey and the albedo by p.y. It adds no specular.
            reach = atten * shadow *
                smoothstep(mix(0.8, 0.2, p.x), mix(0.9, 0.5, p.x), 1.0 - nv_abs);
            let across = l - cam * dot(cam, l);
            let rim_dir = select(vec3<f32>(0.0), normalize(across), dot(across, across) > 1e-8);
            weight = clamp(dot(s.n, rim_dir), 0.0, 1.0);
            tier_hi = mix(vec3<f32>(0.5), s.albedo_d, p.y);
            spec_gate = 0.0;
        } else {
            // Specular only: a highlight on surfaces smoother than p.x, sharpened toward
            // mirror by p.y, and restricted to metal by p.z
            weight = ndotl_sat;
            spec_gate = smoothstep(p.x + 0.05, p.x - 0.05, s.roughness) *
                ((1.0 - p.z) + step(0.5, s.metallic) * p.z);
            roughness_bias = p.y;
        }

        let scaled = radiance * reach;
        color = color + scaled * mix(tier_lo, tier_hi, weight);
        if spec_gate > 0.0 {
            // The additional lights' highlight uses the PLAIN half vector, not the key light's
            // stylized one, and the type's own roughness override
            let a = mix(s.ggx_alpha, 0.01, roughness_bias);
            let h = normalize(l + s.view_dir);
            let d = hgrp_ggx_d(dot(s.n, h), a);
            let lobe = hgrp_spec_term(d, a, s.ndotv) * spec_gate * light.spot_scale_type.z;
            color = color + scaled * (s.spec_color * lobe) * weight;
        }
    }
    return color;
}
