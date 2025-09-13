// Noise and procedural generation functions

// Simple hash function for pseudo-random numbers
fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// 2D noise function
fn noise_2d(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);

    let a = hash(i);
    let b = hash(i + vec2<f32>(1.0, 0.0));
    let c = hash(i + vec2<f32>(0.0, 1.0));
    let d = hash(i + vec2<f32>(1.0, 1.0));

    let u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Fractal noise (multiple octaves)
fn fractal_noise_2d(p: vec2<f32>, octaves: i32) -> f32 {
    var value = 0.0;
    var amplitude = 1.0;
    var frequency = 1.0;
    var max_value = 0.0;

    for (var i = 0; i < octaves; i++) {
        value += noise_2d(p * frequency) * amplitude;
        max_value += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    return value / max_value;
}

// Simplex-like noise
fn simplex_noise_2d(p: vec2<f32>) -> f32 {
    const K1 = 0.366025404; // (sqrt(3) - 1) / 2
    const K2 = 0.211324865; // (3 - sqrt(3)) / 6

    let i = floor(p + (p.x + p.y) * K1);
    let a = p - i + (i.x + i.y) * K2;

    let m = step(a.yx, a.xy);
    let o1 = m;
    let o2 = 1.0 - m;

    let b = a - o1 + K2;
    let c = a - o2 + K2;
    let d = a - 1.0 + 2.0 * K2;

    let t = max(0.5 - dot(a, a), 0.0);
    let t2 = t * t;
    let t4 = t2 * t2;

    let n1 = t4 * dot(gradient_2d(i), a);
    let n2 = t4 * dot(gradient_2d(i + o1), b);
    let n3 = t4 * dot(gradient_2d(i + o2), c);
    let n4 = t4 * dot(gradient_2d(i + 1.0), d);

    return 7.0 * (n1 + n2 + n3 + n4);
}

// Gradient function for simplex noise
fn gradient_2d(i: vec2<f32>) -> vec2<f32> {
    let u = i.x + i.y * 57.0;
    let hash = fract(sin(u) * 43758.5453);
    let hash2 = fract(sin(u + 1.0) * 43758.5453);

    return vec2<f32>(
        hash * 2.0 - 1.0,
        hash2 * 2.0 - 1.0
    );
}

// Perlin-style turbulence
fn turbulence_2d(p: vec2<f32>, octaves: i32) -> f32 {
    var value = 0.0;
    var amplitude = 1.0;
    var frequency = 1.0;

    for (var i = 0; i < octaves; i++) {
        value += abs(noise_2d(p * frequency)) * amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    return value;
}
