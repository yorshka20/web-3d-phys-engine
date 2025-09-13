// Phong lighting model functions

// Calculate light intensity for toon shading
fn calculate_light_intensity(normal: vec3<f32>) -> f32 {
    let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.5));
    let ndotl = dot(normal, light_dir);
    return clamp((ndotl + 1.0) * 0.5, 0.0, 1.0);
}

// Standard Phong lighting calculation
fn calculate_phong_lighting(
    normal: vec3<f32>,
    view_dir: vec3<f32>,
    light_dir: vec3<f32>,
    diffuse_color: vec3<f32>,
    specular_color: vec3<f32>,
    shininess: f32
) -> vec3<f32> {
    let NdotL = max(dot(normal, light_dir), 0.0);
    let half_dir = normalize(light_dir + view_dir);
    let NdotH = max(dot(normal, half_dir), 0.0);

    let diffuse = diffuse_color * NdotL;
    let specular = specular_color * pow(NdotH, shininess);

    return diffuse + specular;
}

// Fresnel calculation
fn calculate_fresnel(view_dir: vec3<f32>, normal: vec3<f32>, power: f32) -> f32 {
    let fresnel = pow(1.0 - max(dot(view_dir, normal), 0.0), power);
    return fresnel;
}
