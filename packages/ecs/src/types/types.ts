/**
 * Common utility types used across the codebase
 */

import { vec2, vec3, vec4 } from 'gl-matrix';

/**
 * Represents a 2D point with x and y coordinates
 */
export type Point = [number, number];

/**
 * Represents a 2D size with width and height
 */
export type Size = [number, number];

export type Viewport = RectArea;
/**
 * Represents a rectangular area with [x, y, width, height]
 */
export type RectArea = [number, number, number, number];

/**
 * Represents a 2D vector with x and y components
 */
export type Vec2 = vec2;

export type Vec3 = vec3;

export type Vec4 = vec4;

export interface Resolution {
  width: number;
  height: number;
}

export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Represents a color in RGBA format
 */
export type Color = {
  r: number;
  g: number;
  b: number;
  a: number;
};

/**
 * Represents a transform with position, rotation and scale
 */
export type Transform = {
  position: Point;
  rotation: number;
  scale: number;
};
