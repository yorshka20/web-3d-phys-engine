// HGRP outline: depth-offset inverted hull. Vertices extrude along the view-space normal's
// xy, scaled by view distance so the stroke keeps an approximately constant screen width
// (extruding in view space lets the projection matrix handle aspect); _OutlineMask (ST)
// scales the width per texel (white = full stroke, black = suppressed — probed 2026-09-01),
// and _OutlineOffsetZ pushes the hull away from the camera so inner lines (nose, face
// creases) recede behind the surface while true silhouettes survive. The hull renders with
// front-face culling so only the silhouette band remains. Outline color = HSV-adjusted base
// map (_OutlineColorBrightness/_OutlineColorSaturation), the same adjustment family as
// shadows; cutout materials discard so no stroke shows behind alpha-clipped holes.
// Structs come from includes (core/uniforms, core/gltf_types, generated/hgrp_material_params,
// math/color); group 0 (time) exists in the pipeline layout but is not used here.

@group(1) @binding(0) var<uniform> mvp: MVPUniforms;
@group(1) @binding(1) var<storage, read> joint_matrices: array<mat4x4<f32>>;

@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;
@group(2) @binding(1) var base_map: texture_2d<f32>;
@group(2) @binding(2) var base_sampler: sampler;
@group(2) @binding(3) var outline_mask: texture_2d<f32>; // _OutlineMask (ST), default white

struct OutlineVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv0: vec2<f32>,
}

// View-space width per _OutlineWidth unit per unit view distance (presets: 0.5-0.65) and
// world units pushed back per _OutlineOffsetZ unit (presets: 0.75 face / 0.01-0.02 hair,
// cloth). v1 calibration constants. The width term cancels view distance so it is scale
// invariant; the z push is in world units and tracks the scene's metre scale.
const OUTLINE_WIDTH_SCALE: f32 = 0.006;
const OUTLINE_OFFSET_Z_SCALE: f32 = 0.01;

@vertex
fn vs_main(input: GLTFVertexInput) -> OutlineVertexOutput {
    var output: OutlineVertexOutput;

    let skin = gltf_skin_matrix(input.joints_0, input.weights_0);
    let world_position = mvp.model_matrix * skin * vec4<f32>(input.position, 1.0);
    let view_pos = mvp.view_matrix * world_position;
    let skinned_normal = (skin * vec4<f32>(input.normal, 0.0)).xyz;
    let world_normal = normalize((mvp.normal_matrix * vec4<f32>(skinned_normal, 0.0)).xyz);
    let view_normal = (mvp.view_matrix * vec4<f32>(world_normal, 0.0)).xyz;

    let mask = textureSampleLevel(outline_mask, base_sampler, input.texcoord_0, 0.0).r;
    let view_distance = max(-view_pos.z, 0.001);
    let width = hgrp_material.outline_width * mask * OUTLINE_WIDTH_SCALE * view_distance;

    var extruded = view_pos.xyz + vec3<f32>(view_normal.xy, 0.0) * width;
    extruded.z -= hgrp_material.outline_offset_z * OUTLINE_OFFSET_Z_SCALE;

    output.position = mvp.projection_matrix * vec4<f32>(extruded, 1.0);
    output.uv0 = input.texcoord_0;
    return output;
}

@fragment
fn fs_main(input: OutlineVertexOutput) -> @location(0) vec4<f32> {
    let base = textureSample(base_map, base_sampler, input.uv0);
    if hgrp_material.alpha_cutoff > 0.0 && base.a < hgrp_material.alpha_cutoff {
        discard;
    }
    var hsv = rgb_to_hsv(base.rgb);
    hsv.y = clamp(hsv.y * hgrp_material.outline_color_saturation, 0.0, 1.0);
    hsv.z = hsv.z * hgrp_material.outline_color_brightness;
    return vec4<f32>(hsv_to_rgb(hsv), 1.0);
}
