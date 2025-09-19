// Forward rendering pass definitions
// This file contains common structures and functions for forward rendering

// Forward rendering vertex output
struct ForwardVertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) view_direction: vec3<f32>,
}

// Forward rendering fragment input
struct ForwardFragmentInput {
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) view_direction: vec3<f32>,
}

// Standard forward vertex shader function
fn forward_vertex_transform(
    position: vec3<f32>,
    normal: vec3<f32>,
    uv: vec2<f32>
) -> ForwardVertexOutput {
    var output: ForwardVertexOutput;

    let world_pos = mvp.mvp_matrix * vec4<f32>(position, 1.0);
    output.clip_position = world_pos;
    output.world_position = world_pos.xyz;
    output.world_normal = normalize(normal);
    output.uv = uv;
    output.view_direction = normalize(mvp.camera_pos - output.world_position);

    return output;
}

// Standard forward lighting calculation
fn forward_lighting(
    fragment: ForwardFragmentInput,
    albedo: vec3<f32>,
    metallic: f32,
    roughness: f32,
    emissive: vec3<f32>
) -> vec3<f32> {
    let light_dir = normalize(DEFAULT_LIGHT_DIRECTION);
    let n_dot_l = max(dot(fragment.world_normal, light_dir), 0.0);
    let n_dot_v = max(dot(fragment.world_normal, fragment.view_direction), 0.0);
    
    // Simple PBR approximation
    let F0 = mix(vec3<f32>(0.04), albedo, metallic);
    let half_dir = normalize(light_dir + fragment.view_direction);
    let n_dot_h = max(dot(fragment.world_normal, half_dir), 0.0);
    let v_dot_h = max(dot(fragment.view_direction, half_dir), 0.0);

    let F = calculate_fresnel_pbr(v_dot_h, metallic, albedo);
    let D = calculate_ndf_ggx(n_dot_h, roughness);
    let G = calculate_geometry_smith(n_dot_v, n_dot_l, roughness);

    let brdf = (D * G * F) / (4.0 * n_dot_v * n_dot_l + EPSILON);
    let radiance = vec3<f32>(1.0) * n_dot_l;

    let ambient = albedo * AMBIENT_FACTOR;
    let diffuse = (vec3<f32>(1.0) - F) * albedo * (1.0 - metallic) * n_dot_l;
    let specular = brdf * radiance;

    return ambient + diffuse + specular + emissive;
}
