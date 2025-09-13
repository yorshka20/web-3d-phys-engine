// Color space conversion and manipulation functions

// HSV to RGB color conversion
fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
    let c = hsv.z * hsv.y;
    let x = c * (1.0 - abs((hsv.x * 6.0) % 2.0 - 1.0));
    let m = hsv.z - c;

    var rgb: vec3<f32>;
    if hsv.x < 1.0 / 6.0 {
        rgb = vec3<f32>(c, x, 0.0);
    } else if hsv.x < 2.0 / 6.0 {
        rgb = vec3<f32>(x, c, 0.0);
    } else if hsv.x < 3.0 / 6.0 {
        rgb = vec3<f32>(0.0, c, x);
    } else if hsv.x < 4.0 / 6.0 {
        rgb = vec3<f32>(0.0, x, c);
    } else if hsv.x < 5.0 / 6.0 {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }

    return rgb + vec3<f32>(m);
}

// RGB to HSV color conversion
fn rgb_to_hsv(rgb: vec3<f32>) -> vec3<f32> {
    let max_val = max(max(rgb.r, rgb.g), rgb.b);
    let min_val = min(min(rgb.r, rgb.g), rgb.b);
    let delta = max_val - min_val;

    var hsv: vec3<f32>;
    hsv.z = max_val; // Value

    if max_val > 0.0 {
        hsv.y = delta / max_val; // Saturation
    } else {
        hsv.y = 0.0;
        hsv.x = 0.0; // Hue
        return hsv;
    }

    if delta == 0.0 {
        hsv.x = 0.0; // Hue
    } else if max_val == rgb.r {
        hsv.x = ((rgb.g - rgb.b) / delta) % 6.0;
    } else if max_val == rgb.g {
        hsv.x = (rgb.b - rgb.r) / delta + 2.0;
    } else {
        hsv.x = (rgb.r - rgb.g) / delta + 4.0;
    }

    hsv.x = hsv.x / 6.0;
    if hsv.x < 0.0 {
        hsv.x += 1.0;
    }

    return hsv;
}

// Linear to sRGB conversion
fn linear_to_srgb(linear: vec3<f32>) -> vec3<f32> {
    let a = 0.055;
    let gamma = 2.4;

    return select(
        linear / 12.92,
        pow((linear + vec3<f32>(a)) / (1.0 + a), vec3<f32>(gamma)),
        linear > vec3<f32>(0.0031308)
    );
}

// sRGB to linear conversion
fn srgb_to_linear(srgb: vec3<f32>) -> vec3<f32> {
    let a = 0.055;

    return select(
        srgb / 12.92,
        pow((srgb + vec3<f32>(a)) / (1.0 + a), vec3<f32>(2.4)),
        srgb > vec3<f32>(0.04045)
    );
}
