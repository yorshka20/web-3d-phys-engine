// Core constants and defines for all shaders

// Mathematical constants
const PI: f32 = 3.14159265359;
const TWO_PI: f32 = 6.28318530718;
const HALF_PI: f32 = 1.57079632679;
const EPSILON: f32 = 0.00001;

// Color space constants
const GAMMA: f32 = 2.4;
const GAMMA_RECIPROCAL: f32 = 0.416666667;
const SRGB_THRESHOLD: f32 = 0.0031308;

// Lighting constants
const DEFAULT_LIGHT_DIRECTION: vec3<f32> = vec3<f32>(0.5, 1.0, 0.5);
const AMBIENT_FACTOR: f32 = 0.1;

// Texture sampling constants
const MAX_MIP_LEVEL: f32 = 12.0;
