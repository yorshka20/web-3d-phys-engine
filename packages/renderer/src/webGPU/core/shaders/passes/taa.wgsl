// Temporal anti-aliasing resolve over the ENCODED LDR tonemap output (TAAPass.ts).
//
// The geometry passes render with a sub-pixel projection jitter (MVPUniformManager); this
// pass blends the jittered frame with the accumulated history, reprojected through the
// depth buffer: pixel -> world position (inverse of this frame's UNJITTERED view-projection)
// -> previous frame's UNJITTERED view-projection -> history UV. Camera motion is therefore
// exact; object motion (skinned characters) has no velocity buffer yet, so the history is
// clamped to the 3x3 neighbourhood colour box of the current frame, which turns ghosting into
// a brief softening. Runs in the perceptual (encoded) domain, after the tonemap, like FXAA.

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var history: texture_2d<f32>;
@group(0) @binding(2) var history_sampler: sampler;
@group(0) @binding(3) var scene_depth: texture_depth_2d;

struct TAAParams {
    prev_view_proj: mat4x4<f32>,
    inv_view_proj: mat4x4<f32>,
    // x = weight of the current frame, y = 1.0 when the history is invalid (first frame,
    // resize, mode switch)
    params: vec4<f32>,
}
@group(0) @binding(4) var<uniform> taa: TAAParams;

struct TAAVertexOutput {
    @builtin(position) position: vec4<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> TAAVertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var output: TAAVertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    return output;
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<i32>(textureDimensions(src));
    let p = vec2<i32>(position.xy);
    let current = textureLoad(src, p, 0).rgb;

    var box_min = current;
    var box_max = current;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let q = clamp(p + vec2<i32>(dx, dy), vec2<i32>(0), dims - vec2<i32>(1));
            let c = textureLoad(src, q, 0).rgb;
            box_min = min(box_min, c);
            box_max = max(box_max, c);
        }
    }

    // Depth is the clip z/w the geometry pass produced; inverting the same view-projection
    // recovers the world position regardless of the projection's depth convention.
    let depth = textureLoad(scene_depth, p, 0);
    let uv = (vec2<f32>(p) + vec2<f32>(0.5)) / vec2<f32>(dims);
    let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
    let world_h = taa.inv_view_proj * ndc;
    let world = world_h / world_h.w;
    let prev = taa.prev_view_proj * world;
    let prev_uv = (prev.xy / prev.w) * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);

    let in_bounds = prev.w > 0.0 &&
        all(prev_uv >= vec2<f32>(0.0)) && all(prev_uv <= vec2<f32>(1.0));
    let valid = taa.params.y < 0.5 && in_bounds;

    // textureSampleLevel: no implicit derivatives, so it may sit behind a per-pixel branch
    let sampled = textureSampleLevel(history, history_sampler, prev_uv, 0.0).rgb;
    let clamped = clamp(sampled, box_min, box_max);
    let blended = mix(clamped, current, taa.params.x);
    return vec4<f32>(select(current, blended, valid), 1.0);
}
