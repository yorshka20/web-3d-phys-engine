import type { vec2, vec3, vec4 } from 'gl-matrix';

// Base value types for the renderer's public vocabulary. Kept structurally
// identical to the ecs-side aliases so data flows across the boundary without
// conversion; the renderer must not import them from @ecs.
export type Vec2 = vec2;
export type Vec3 = vec3;
export type Vec4 = vec4;

/** [x, y, width, height] */
export type RectArea = [number, number, number, number];

export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

/** r/g/b in 0-255, a in 0-1 */
export type RgbaColor = RgbColor & {
  a: number;
};

export type Color = RgbaColor;
