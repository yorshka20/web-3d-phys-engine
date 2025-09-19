// Toon shading lighting functions

// Calculate toon lighting with discrete steps
fn calculate_toon_lighting(nDotL: f32, steps: i32) -> f32 {
    let step_size = 1.0 / f32(steps);
    let stepped = floor(nDotL / step_size) * step_size;
    return clamp(stepped, 0.0, 1.0);
}

// Calculate rim lighting for toon shading
fn calculate_rim_lighting(nDotV: f32, rimPower: f32) -> f32 {
    return pow(1.0 - nDotV, rimPower);
}

// Calculate toon specular with sharp cutoff
fn calculate_toon_specular(nDotH: f32, shininess: f32, threshold: f32) -> f32 {
    let specular = pow(nDotH, shininess);
    return step(threshold, specular);
}

// Complete toon lighting calculation
fn calculate_toon_shading(
    normal: vec3<f32>,
    viewDir: vec3<f32>,
    lightDir: vec3<f32>,
    baseColor: vec3<f32>,
    specularColor: vec3<f32>,
    steps: i32,
    rimPower: f32,
    specularThreshold: f32
) -> vec3<f32> {
    let n_dot_l = max(dot(normal, lightDir), 0.0);
    let n_dot_v = max(dot(normal, viewDir), 0.0);
    let half_dir = normalize(lightDir + viewDir);
    let n_dot_h = max(dot(normal, half_dir), 0.0);
    
    // Toon diffuse
    let toon_diffuse = calculate_toon_lighting(n_dot_l, steps);
    let diffuse = baseColor * toon_diffuse;
    
    // Toon specular
    let toon_specular = calculate_toon_specular(n_dot_h, 32.0, specularThreshold);
    let specular = specularColor * toon_specular;
    
    // Rim lighting
    let rim = calculate_rim_lighting(n_dot_v, rimPower);
    let rim_color = vec3<f32>(0.2, 0.4, 0.8) * rim;

    return diffuse + specular + rim_color;
}
