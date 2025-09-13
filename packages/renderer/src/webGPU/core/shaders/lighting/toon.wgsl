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
    let nDotL = max(dot(normal, lightDir), 0.0);
    let nDotV = max(dot(normal, viewDir), 0.0);
    let halfDir = normalize(lightDir + viewDir);
    let nDotH = max(dot(normal, halfDir), 0.0);
    
    // Toon diffuse
    let toonDiffuse = calculate_toon_lighting(nDotL, steps);
    let diffuse = baseColor * toonDiffuse;
    
    // Toon specular
    let toonSpecular = calculate_toon_specular(nDotH, 32.0, specularThreshold);
    let specular = specularColor * toonSpecular;
    
    // Rim lighting
    let rim = calculate_rim_lighting(nDotV, rimPower);
    let rimColor = vec3<f32>(0.2, 0.4, 0.8) * rim;

    return diffuse + specular + rimColor;
}
