// HGRP outline: depth-offset inverted hull. Vertices extrude along their normal by
// _OutlineWidth (model space, v1 constant scale — the game's screen-space width correction
// is a calibration item); the hull renders with front-face culling so only the silhouette
// band survives. Outline color = HSV-adjusted base map
// (_OutlineColorBrightness/_OutlineColorSaturation), the same adjustment family as shadows.
// Structs come from includes (core/uniforms, core/gltf_types, core/hgrp_types, math/color);
// group 0 (time) exists in the pipeline layout but is not used here.

@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;
@group(2) @binding(1) var base_map: texture_2d<f32>;
@group(2) @binding(2) var base_sampler: sampler;

struct OutlineVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv0: vec2<f32>,
}

// Model-space meters per _OutlineWidth unit (presets: 0.5-0.65). v1 calibration constant.
const OUTLINE_WIDTH_SCALE: f32 = 0.002;

@vertex
fn vs_main(input: GLTFVertexInput) -> OutlineVertexOutput {
    var output: OutlineVertexOutput;
    let extruded = input.position +
        input.normal * (hgrp_material.outline_width * OUTLINE_WIDTH_SCALE);
    let world_position = mvp.model_matrix * vec4<f32>(extruded, 1.0);
    output.position = mvp.projection_matrix * mvp.view_matrix * world_position;
    output.uv0 = input.texcoord_0;
    return output;
}

@fragment
fn fs_main(input: OutlineVertexOutput) -> @location(0) vec4<f32> {
    let base = textureSample(base_map, base_sampler, input.uv0);
    var hsv = rgb_to_hsv(base.rgb);
    hsv.y = clamp(hsv.y * hgrp_material.outline_color_saturation, 0.0, 1.0);
    hsv.z = hsv.z * hgrp_material.outline_color_brightness;
    return vec4<f32>(hsv_to_rgb(hsv), 1.0);
}
