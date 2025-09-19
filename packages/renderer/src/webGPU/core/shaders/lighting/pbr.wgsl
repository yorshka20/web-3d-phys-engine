// Physically Based Rendering lighting functions

// Calculate Fresnel reflectance using Schlick's approximation
fn calculate_fresnel_schlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    let factor = pow(1.0 - cosTheta, 5.0);
    return F0 + (vec3<f32>(1.0) - F0) * factor;
}

// Calculate Fresnel reflectance for metals and dielectrics
fn calculate_fresnel_pbr(cosTheta: f32, metallic: f32, albedo: vec3<f32>) -> vec3<f32> {
    let F0 = mix(vec3<f32>(0.04), albedo, metallic);
    return calculate_fresnel_schlick(cosTheta, F0);
}

// Normal Distribution Function (Trowbridge-Reitz GGX)
fn calculate_ndf_ggx(nDotH: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let n_dot_h2 = nDotH * nDotH;
    let denominator = n_dot_h2 * (a2 - 1.0) + 1.0;
    return a2 / (PI * denominator * denominator);
}

// Geometry function (Smith's method)
fn calculate_geometry_smith(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;

    let ggx1 = nDotV / (nDotV * (1.0 - k) + k);
    let ggx2 = nDotL / (nDotL * (1.0 - k) + k);

    return ggx1 * ggx2;
}

// Cook-Torrance BRDF
fn calculate_cook_torrance_brdf(
    nDotV: f32,
    nDotL: f32,
    nDotH: f32,
    vDotH: f32,
    metallic: f32,
    roughness: f32,
    albedo: vec3<f32>
) -> vec3<f32> {
    let F = calculate_fresnel_pbr(vDotH, metallic, albedo);
    let D = calculate_ndf_ggx(nDotH, roughness);
    let G = calculate_geometry_smith(nDotV, nDotL, roughness);

    let numerator = D * G * F;
    let denominator = 4.0 * nDotV * nDotL + EPSILON;

    return numerator / denominator;
}
