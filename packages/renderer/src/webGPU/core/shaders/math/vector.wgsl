// Vector mathematics utility functions

// Vector normalization with epsilon check
fn safe_normalize(v: vec3<f32>) -> vec3<f32> {
    let length = length(v);
    return select(normalize(v), vec3<f32>(0.0), length < EPSILON);
}

// Vector projection
fn project_vector(a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
    return dot(a, b) / dot(b, b) * b;
}

// Vector rejection
fn reject_vector(a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
    return a - project_vector(a, b);
}

// Vector reflection
fn reflect_vector(incident: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    return incident - 2.0 * dot(incident, normal) * normal;
}

// Vector refraction
fn refract_vector(incident: vec3<f32>, normal: vec3<f32>, eta: f32) -> vec3<f32> {
    let cos_i = -dot(normal, incident);
    let sin_t2 = eta * eta * (1.0 - cos_i * cos_i);

    if sin_t2 > 1.0 {
        return vec3<f32>(0.0); // Total internal reflection
    }

    let cos_t = sqrt(1.0 - sin_t2);
    return eta * incident + (eta * cos_i - cos_t) * normal;
}

// Distance between two points
fn distance_squared(a: vec3<f32>, b: vec3<f32>) -> f32 {
    let diff = a - b;
    return dot(diff, diff);
}

// Clamp vector components
fn clamp_vector(v: vec3<f32>, min_val: f32, max_val: f32) -> vec3<f32> {
    return vec3<f32>(
        clamp(v.x, min_val, max_val),
        clamp(v.y, min_val, max_val),
        clamp(v.z, min_val, max_val)
    );
}

// Linear interpolation for vectors
fn lerp_vector(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
    return a + t * (b - a);
}

// Spherical linear interpolation for unit vectors
fn slerp_vector(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
    let dot_ab = dot(a, b);
    let theta = acos(clamp(dot_ab, -1.0, 1.0));

    if abs(theta) < EPSILON {
        return lerp_vector(a, b, t);
    }

    let sin_theta = sin(theta);
    let a_factor = sin((1.0 - t) * theta) / sin_theta;
    let b_factor = sin(t * theta) / sin_theta;

    return a_factor * a + b_factor * b;
}
