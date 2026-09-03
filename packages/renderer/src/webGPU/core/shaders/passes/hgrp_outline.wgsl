// HGRP outline: the CharacterOutline pass of the decompiled shader (hgrp-decompiled-formulas.md
// §5), an inverted hull with front-face culling. Vertices move along the view-space SMOOTH
// normal's xy — the position-averaged normal the converter bakes into COLOR_0
// (_OutlineAverageNormal; the game stores it in a second UV set), so the hull stays closed
// across hard edges and UV seams; a mesh without the bake falls back to its shading normal.
// The offset is an NDC displacement that is constant in WORLD size beyond a short distance —
// about 2 mm per _OutlineWidth unit — with a half-pixel floor per axis so a far stroke never
// vanishes, and screen-constant only very close to the camera. _OutlineMask scales the width
// per texel (white = full stroke). _OutlineOffsetZ pushes the hull 0.1 m per unit down the view
// ray, changing its depth alone, so inner lines (nose, face creases) recede behind the surface
// while true silhouettes survive. The stroke color is the base color at _OutlineColorBrightness
// with its saturation scaled by _OutlineColorSaturation, then lit like the body — light(N)
// times the shade blend, with the rampless smoothstep weights — through the hull's smooth
// normal, which stands in for the screen normal the game reads from its PreGBuffer. Cutout
// materials discard so no stroke shows behind alpha-clipped holes.
// Structs and formulas come from includes (core/uniforms, core/gltf_types,
// generated/hgrp_material_params, math/color, lighting/hgrp_lighting); group 0 (time) exists in
// the pipeline layout but is not used here.

@group(1) @binding(0) var<uniform> mvp: MVPUniforms;
@group(1) @binding(1) var<storage, read> joint_matrices: array<mat4x4<f32>>;

@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;
@group(2) @binding(1) var base_map: texture_2d<f32>;
@group(2) @binding(2) var base_sampler: sampler;
@group(2) @binding(3) var outline_mask: texture_2d<f32>; // _OutlineMask (ST), default white

@group(3) @binding(0) var scene_depth: texture_depth_2d;
@group(3) @binding(1) var<uniform> scene_lighting: SceneLighting;

struct OutlineVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv0: vec2<f32>,
    @location(1) world_normal: vec3<f32>,
}

// The decompiled width: normalize(viewN.xy) x (h/w, 1) x (_OutlineWidth x (pi/8) / halfFov)
// x min(1, 4.58 x depth x halfFov) x 0.005 / depth, in NDC. Past depth x halfFov = 0.218 it
// falls off as 1/depth — a constant world width of 0.005 x (pi/8) x tan(halfFov)/halfFov
// metres per unit, about 2 mm; nearer than that it is a constant 0.009 x _OutlineWidth of the
// screen.
const HGRP_OUTLINE_PI_OVER_8: f32 = 0.39269908;
const HGRP_OUTLINE_NEAR_KNEE: f32 = 4.58;
const HGRP_OUTLINE_NDC_SCALE: f32 = 0.005;
// Metres pushed down the view ray per _OutlineOffsetZ unit (asset metres, scaled at use)
const HGRP_OUTLINE_OFFSET_Z_METRES: f32 = 0.1;

@vertex
fn vs_main(input: GLTFVertexInput) -> OutlineVertexOutput {
    var output: OutlineVertexOutput;

    let skin = gltf_skin_matrix(input.joints_0, input.weights_0);
    let world_position = mvp.model_matrix * skin * vec4<f32>(input.position, 1.0);
    let view_pos = mvp.view_matrix * world_position;
    let baked = input.color_0.xyz * 2.0 - vec3<f32>(1.0);
    // The default vertex color (1,1,1,1) decodes to (1,1,1); a baked normal has unit length
    let extrude_normal = select(input.normal, baked, abs(length(baked) - 1.0) < 0.1);
    let skinned_normal = (skin * vec4<f32>(extrude_normal, 0.0)).xyz;
    let world_normal = normalize((mvp.normal_matrix * vec4<f32>(skinned_normal, 0.0)).xyz);
    let view_normal = (mvp.view_matrix * vec4<f32>(world_normal, 0.0)).xyz;

    let mask = textureSampleLevel(outline_mask, base_sampler, input.texcoord_0, 0.0).r;
    let depth = max(-view_pos.z, 0.001);
    let half_fov = atan(1.0 / mvp.projection_matrix[1][1]);
    // P[0][0] / P[1][1] = height / width: the x offset is squeezed so the stroke stays round
    let aspect_fix = mvp.projection_matrix[0][0] / mvp.projection_matrix[1][1];
    let dir_len = length(view_normal.xy);
    let dir = select(vec2<f32>(0.0), view_normal.xy / dir_len, dir_len > 1e-5);
    let magnitude = hgrp_material.outline_width * mask * (HGRP_OUTLINE_PI_OVER_8 / half_fov) *
        min(1.0, HGRP_OUTLINE_NEAR_KNEE * depth * half_fov) * HGRP_OUTLINE_NDC_SCALE / depth;
    var ndc_offset = dir * vec2<f32>(aspect_fix, 1.0) * magnitude;
    // Half-pixel floor: 1 NDC unit per axis is half the framebuffer, so 1/size is half a pixel
    let half_pixel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(scene_depth));
    ndc_offset = sign(ndc_offset) * max(abs(ndc_offset), half_pixel);

    let clip = mvp.projection_matrix * view_pos;
    let ndc_xy = clip.xy / clip.w + ndc_offset;
    // Depth push down the view ray: the xy stay where the offset put them, only z/w change
    let push = hgrp_material.outline_offset_z * HGRP_OUTLINE_OFFSET_Z_METRES * hgrp_model_scale();
    let pushed = mvp.projection_matrix * vec4<f32>(view_pos.xyz + normalize(view_pos.xyz) * push, 1.0);
    output.position = vec4<f32>(ndc_xy * pushed.w, pushed.z, pushed.w);
    output.uv0 = input.texcoord_0;
    output.world_normal = world_normal;
    return output;
}

@fragment
fn fs_main(input: OutlineVertexOutput) -> @location(0) vec4<f32> {
    let base = textureSample(base_map, base_sampler, input.uv0) * hgrp_material.base_color;
    if hgrp_material.alpha_cutoff > 0.0 && base.a < hgrp_material.alpha_cutoff {
        discard;
    }
    let darkened = base.rgb * hgrp_material.outline_color_brightness;
    let color = mix(vec3<f32>(hgrp_luma(darkened)), darkened, hgrp_material.outline_color_saturation);

    // Lit like the body, with the rampless weights: smoothstep(0.25, 1, ...) of the biased n.l
    // and of n.camDir, the rgb tint identity (the ramp channels are one scalar here)
    let n = normalize(input.world_normal);
    let shade_nl = clamp(dot(n, hgrp_light_dir()) + scene_lighting.light_dir.w, -1.0, 1.0);
    let w = smoothstep(0.25, 1.0, shade_nl);
    let w_view = smoothstep(0.25, 1.0, dot(n, hgrp_cam_dir()));
    let shadow = hgrp_shadow_color_adjust(
        color,
        hgrp_material.shadow_color_brightness,
        hgrp_material.shadow_color_saturation,
    );
    let blend = hgrp_shade_blend(color, shadow, vec4<f32>(w), w_view, 1.0, 0.0);
    let light = hgrp_light(n, scene_lighting.env_color.rgb, blend.w2);

    return vec4<f32>(hgrp_bright_saturation(light * blend.col), clamp(2.0 * base.a, 0.0, 1.0));
}
