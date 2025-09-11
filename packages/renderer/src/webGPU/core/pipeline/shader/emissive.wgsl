 
struct TimeUniforms {
    time: f32,
    deltaTime: f32,
    frameCount: u32,
    padding: u32,
}
      
struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
}

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
}

@group(0) @binding(0) var<uniform> timeData: TimeUniforms;
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let t = timeData.time;

    out.position = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
    out.normal = input.normal;
    out.uv = input.uv;
    out.color = vec4<f32>(t, 1.0 - t, sin(t * 1.0), 1.0);
    return out;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let t = timeData.time;

    let pulse = sin(t * 2.0) * 0.2 + 0.8;  // more stable pulse

    let hue = (t * 0.5) % 1.0;
    let animatedColor = hsv_to_rgb(vec3<f32>(hue, 0.8, 1.0));  // slightly lower saturation

    return vec4<f32>(animatedColor * pulse, color.w);
}

// HSV to RGB helper function
fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
    let c = hsv.z * hsv.y;
    let x = c * (1.0 - abs((hsv.x * 6.0) % 2.0 - 1.0));
    let m = hsv.z - c;

    var rgb: vec3<f32>;
    if hsv.x < 1.0 / 6.0 { rgb = vec3<f32>(c, x, 0.0); } else if hsv.x < 2.0 / 6.0 { rgb = vec3<f32>(x, c, 0.0); } else if hsv.x < 3.0 / 6.0 { rgb = vec3<f32>(0.0, c, x); } else if hsv.x < 4.0 / 6.0 { rgb = vec3<f32>(0.0, x, c); } else if hsv.x < 5.0 / 6.0 { rgb = vec3<f32>(x, 0.0, c); } else { rgb = vec3<f32>(c, 0.0, x); }

    return rgb + vec3<f32>(m);
}
 