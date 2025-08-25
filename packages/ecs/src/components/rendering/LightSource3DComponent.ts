import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';
import { RgbaColor } from '@ecs/utils/color';
import { SerializedLight } from '@renderer/rayTracing';

export type LightType = 'point' | 'directional' | 'ambient' | 'spot';
export type AttenuationType = 'none' | 'linear' | 'quadratic' | 'realistic';

/**
 * Light source component for 2D ray tracing
 * @property {number[]} position - The position of the light source in the format [x, y].
 * @property {number} height - The Z coordinate of the light source.
 * @property {RgbaColor} color - The color of the light.
 * @property {number} intensity - The intensity of the light, affecting its brightness.
 * @property {number} radius - The radius of the light's influence.
 * @property {LightType} type - The type of light source.
 * @property {boolean} castShadows - Whether this light casts shadows.
 * @property {AttenuationType} attenuation - How light intensity decreases with distance.
 */
export class LightSource3DComponent extends Component {
  static componentName = 'LightSource';

  position: [number, number] = [0, 0];
  color: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };
  intensity = 1;
  radius = 100;

  // 3d support
  height = 0; // Z coordinate, 0 means on the scene plane

  // light type and behavior
  type: LightType = 'point';
  castShadows = true;
  attenuation: AttenuationType = 'quadratic';

  // directional light specific properties
  direction: [number, number, number] = [0, 0, -1]; // default down

  // spot light specific properties
  spotAngle = 45; // spot light cone angle (degrees)
  spotPenumbra = 5; // edge fade angle (degrees)

  // control properties
  enabled = true;
  layer = 0; // light layer, for layered rendering

  // Enhanced 3D properties for WebGPU compatibility
  range: number = 100; // Maximum range for 3D lighting
  shadowMapSize: number = 1024; // Shadow map resolution
  shadowBias: number = 0.001; // Shadow bias to prevent shadow acne
  flicker: boolean = false; // Whether the light flickers
  flickerSpeed: number = 1; // Flicker speed
  flickerIntensity: number = 0.1; // Flicker intensity

  constructor(
    props: {
      position?: [number, number];
      height?: number;
      color?: RgbaColor;
      intensity?: number;
      radius?: number;
      type?: LightType;
      castShadows?: boolean;
      attenuation?: AttenuationType;
      direction?: [number, number, number];
      spotAngle?: number;
      enabled?: boolean;
      layer?: number;
      range?: number;
      shadowMapSize?: number;
      shadowBias?: number;
      flicker?: boolean;
      flickerSpeed?: number;
      flickerIntensity?: number;
    } = {},
  ) {
    super('LightSource');

    // use provided values or defaults
    this.position = props.position ?? [0, 0];
    this.height = props.height ?? 0;
    this.color = props.color ?? { r: 255, g: 255, b: 255, a: 1 };
    this.intensity = props.intensity ?? 1;
    this.radius = props.radius ?? 100;
    this.type = props.type ?? 'point';
    this.castShadows = props.castShadows ?? true;
    this.attenuation = props.attenuation ?? 'quadratic';
    this.direction = props.direction ?? [0, 0, -1];
    this.spotAngle = props.spotAngle ?? 45;
    this.enabled = props.enabled ?? true;
    this.layer = props.layer ?? 0;

    // Enhanced 3D properties
    this.range = props.range ?? 100;
    this.shadowMapSize = props.shadowMapSize ?? 1024;
    this.shadowBias = props.shadowBias ?? 0.001;
    this.flicker = props.flicker ?? false;
    this.flickerSpeed = props.flickerSpeed ?? 1;
    this.flickerIntensity = props.flickerIntensity ?? 0.1;
  }

  // get 3D position
  get position3D(): Vec3 {
    return [this.position[0], this.position[1], this.height];
  }

  // set 3D position
  setPosition3D(pos: Vec3): void {
    this.position = [pos[0], pos[1]];
    this.height = pos[2];
  }

  // get normalized direction vector
  get normalizedDirection(): Vec3 {
    const [x, y, z] = this.direction;
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length === 0) return [0, 0, -1];

    return [x / length, y / length, z / length];
  }

  // calculate distance attenuation
  calculateAttenuation(distance: number): number {
    if (!this.enabled || distance <= 0) return 0;
    if (distance > this.radius) return 0;

    switch (this.attenuation) {
      case 'none':
        return 1;

      case 'linear':
        return Math.max(0, 1 - distance / this.radius);

      case 'quadratic':
        const normalizedDistance = distance / this.radius;
        return Math.max(0, 1 - normalizedDistance * normalizedDistance);

      case 'realistic':
        // more realistic square inverse attenuation, but with minimum distance to prevent division by zero
        const minDistance = 1;
        const effectiveDistance = Math.max(distance, minDistance);
        const falloff = 1 / (effectiveDistance * effectiveDistance);
        // fade out at radius to a small value, not 0
        const radiusFalloff = 1 / (this.radius * this.radius);
        return Math.max(0, falloff - radiusFalloff) / (1 - radiusFalloff);

      default:
        return 1;
    }
  }

  // calculate light intensity (considering distance and angle)
  calculateLightIntensity(targetPos: Vec3): number {
    if (!this.enabled) return 0;

    const lightPos = this.position3D;
    const distance = Math.sqrt(
      (targetPos[0] - lightPos[0]) ** 2 +
        (targetPos[1] - lightPos[1]) ** 2 +
        (targetPos[2] - lightPos[2]) ** 2,
    );

    let intensity = this.intensity;

    // calculate intensity based on light type
    switch (this.type) {
      case 'ambient':
        // ambient light is not affected by distance
        return intensity;

      case 'directional':
        // directional light is not affected by distance, but can consider direction
        return intensity;

      case 'point':
        // point light is affected by distance attenuation
        intensity *= this.calculateAttenuation(distance);
        break;

      case 'spot':
        // spot light needs to check angle
        const lightDir = this.normalizedDirection;
        const targetDir = [
          (targetPos[0] - lightPos[0]) / distance,
          (targetPos[1] - lightPos[1]) / distance,
          (targetPos[2] - lightPos[2]) / distance,
        ];

        const dotProduct =
          lightDir[0] * targetDir[0] + lightDir[1] * targetDir[1] + lightDir[2] * targetDir[2];
        const angle = (Math.acos(Math.max(-1, Math.min(1, dotProduct))) * 180) / Math.PI;

        const halfAngle = this.spotAngle / 2;
        const penumbraStart = halfAngle - this.spotPenumbra;

        if (angle > halfAngle) {
          return 0; // outside cone range
        } else if (angle < penumbraStart) {
          intensity *= this.calculateAttenuation(distance);
        } else {
          // in edge fade region
          const falloff = 1 - (angle - penumbraStart) / this.spotPenumbra;
          intensity *= falloff * this.calculateAttenuation(distance);
        }
        break;
    }

    return Math.max(0, intensity);
  }

  // check if point is in light range
  isPointInRange(targetPos: Vec3): boolean {
    if (!this.enabled) return false;

    if (this.type === 'ambient' || this.type === 'directional') {
      return true; // ambient and directional light affect all points
    }

    const lightPos = this.position3D;
    const distance = Math.sqrt(
      (targetPos[0] - lightPos[0]) ** 2 +
        (targetPos[1] - lightPos[1]) ** 2 +
        (targetPos[2] - lightPos[2]) ** 2,
    );

    return distance <= this.radius;
  }

  // get direction from light source to target point (for shadow calculation)
  getDirectionToTarget(targetPos: Vec3): Vec3 {
    if (this.type === 'directional') {
      // directional light direction is fixed
      return this.normalizedDirection;
    }

    // point light and spot light: from light source to target
    const lightPos = this.position3D;
    const dx = targetPos[0] - lightPos[0];
    const dy = targetPos[1] - lightPos[1];
    const dz = targetPos[2] - lightPos[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length === 0) return [0, 0, 0];

    return [dx / length, dy / length, dz / length];
  }

  // quick set preset light type
  setAsAmbientLight(intensity = 0.3): void {
    this.type = 'ambient';
    this.intensity = intensity;
    this.castShadows = false;
    this.attenuation = 'none';
  }

  setAsDirectionalLight(direction: [number, number, number] = [0, 0, -1], intensity = 1): void {
    this.type = 'directional';
    this.direction = direction;
    this.intensity = intensity;
    this.castShadows = true;
    this.attenuation = 'none';
  }

  setAsPointLight(radius = 100, intensity = 1): void {
    this.type = 'point';
    this.radius = radius;
    this.intensity = intensity;
    this.castShadows = true;
    this.attenuation = 'quadratic';
  }

  setAsSpotLight(angle = 45, penumbra = 5, direction: [number, number, number] = [0, 0, -1]): void {
    this.type = 'spot';
    this.spotAngle = angle;
    this.spotPenumbra = penumbra;
    this.direction = direction;
    this.castShadows = true;
    this.attenuation = 'quadratic';
  }

  // debug information
  getDebugInfo(): string {
    return (
      `Light(${this.type}): pos=[${this.position[0]},${this.position[1]},${this.height}], ` +
      `intensity=${this.intensity}, radius=${this.radius}, shadows=${this.castShadows}`
    );
  }

  // Enhanced 3D methods for WebGPU compatibility

  /**
   * Get the range for 3D lighting
   */
  getRange(): number {
    return this.range;
  }

  /**
   * Set the range for 3D lighting
   */
  setRange(range: number): void {
    this.range = range;
  }

  /**
   * Get shadow map size
   */
  getShadowMapSize(): number {
    return this.shadowMapSize;
  }

  /**
   * Set shadow map size
   */
  setShadowMapSize(size: number): void {
    this.shadowMapSize = size;
  }

  /**
   * Get shadow bias
   */
  getShadowBias(): number {
    return this.shadowBias;
  }

  /**
   * Set shadow bias
   */
  setShadowBias(bias: number): void {
    this.shadowBias = bias;
  }

  /**
   * Get effective intensity considering flicker
   */
  getEffectiveIntensity(time?: number): number {
    if (!this.flicker || !time) {
      return this.intensity;
    }

    const flickerValue = Math.sin(time * this.flickerSpeed) * this.flickerIntensity;
    return this.intensity * (1 + flickerValue);
  }

  /**
   * Set flicker properties
   */
  setFlicker(flicker: boolean, speed: number = 1, intensity: number = 0.1): void {
    this.flicker = flicker;
    this.flickerSpeed = speed;
    this.flickerIntensity = intensity;
  }

  /**
   * Get light color as normalized values (0-1)
   */
  getNormalizedColor(): Vec3 {
    return [this.color.r / 255, this.color.g / 255, this.color.b / 255];
  }

  /**
   * Get light direction as Vec3
   */
  getDirection3D(): Vec3 {
    return this.normalizedDirection;
  }

  /**
   * Set light direction as Vec3
   */
  setDirection3D(direction: Vec3): void {
    this.direction = direction;
  }

  // Convenient creation methods for 3D rendering
  static createDirectionalLight(
    color: RgbaColor,
    intensity: number,
    direction: Vec3,
  ): LightSource3DComponent {
    return new LightSource3DComponent({
      type: 'directional',
      color,
      intensity,
      direction,
      castShadows: true,
      shadowMapSize: 2048,
    });
  }

  static createPointLight(
    color: RgbaColor,
    intensity: number,
    range: number,
  ): LightSource3DComponent {
    return new LightSource3DComponent({
      type: 'point',
      color,
      intensity,
      radius: range,
      range,
    });
  }

  static createSpotLight(
    color: RgbaColor,
    intensity: number,
    angle: number,
    range: number,
  ): LightSource3DComponent {
    return new LightSource3DComponent({
      type: 'spot',
      color,
      intensity,
      spotAngle: angle,
      radius: range,
      range,
      castShadows: true,
    });
  }

  static createAmbientLight(color: RgbaColor, intensity: number): LightSource3DComponent {
    return new LightSource3DComponent({
      type: 'ambient',
      color,
      intensity,
      castShadows: false,
    });
  }

  static createSunLight(): LightSource3DComponent {
    return new LightSource3DComponent({
      type: 'directional',
      color: { r: 255, g: 242, b: 204, a: 1 }, // Warm sunlight color
      intensity: 1,
      direction: [0, -1, 0],
      castShadows: true,
      shadowMapSize: 2048,
    });
  }

  static createFireLight(): LightSource3DComponent {
    return new LightSource3DComponent({
      type: 'point',
      color: { r: 255, g: 128, b: 51, a: 1 }, // Fire color
      intensity: 2,
      radius: 5,
      range: 5,
      flicker: true,
      flickerSpeed: 10,
      flickerIntensity: 0.3,
    });
  }

  /**
   * Calculates the light intensity with distance attenuation for a given light source.
   * @param targetPos The 3D position of the point being shaded.
   * @param light The serialized light source data.
   * @param distance The distance from the light source to the target position.
   * @returns The calculated light intensity, clamped between 0 and 1.
   */
  static calculateLightIntensity(
    targetPos: Vec3,
    light: SerializedLight,
    distance: number,
  ): number {
    if (!light.enabled) return 0;

    // Directional lights have infinite range
    if (light.type === 'directional') {
      return light.intensity;
    }

    // Other light types check distance
    if (distance > light.radius) {
      return 0;
    }

    let intensity = light.intensity;

    // Apply distance attenuation
    switch (light.attenuation) {
      case 'none':
        break; // No attenuation

      case 'linear':
        intensity *= Math.max(0, 1 - distance / light.radius);
        break;

      case 'quadratic':
        const normalizedDistance = distance / light.radius;
        intensity *= Math.max(0, 1 - normalizedDistance * normalizedDistance);
        break;

      case 'realistic':
        const minDistance = 1;
        const effectiveDistance = Math.max(distance, minDistance);
        const falloff = 1 / (effectiveDistance * effectiveDistance);
        const radiusFalloff = 1 / (light.radius * light.radius);
        intensity *= Math.max(0, falloff - radiusFalloff) / (1 - radiusFalloff);
        break;
    }

    return Math.max(0, intensity);
  }

  /**
   * Calculates the falloff factor for a spot light based on the angle between the light direction and the spot direction.
   * @param lightDirection The direction vector from the light source to the shaded point.
   * @param light The serialized spot light source data.
   * @returns The spot light falloff factor, ranging from 0 (outside cone) to 1 (full intensity).
   */
  static calculateSpotLightFalloff(lightDirection: Vec3, light: SerializedLight): number {
    const spotDir: Vec3 = [...light.direction];

    // Normalize spot direction
    const spotLength = Math.sqrt(spotDir[0] ** 2 + spotDir[1] ** 2 + spotDir[2] ** 2);
    if (spotLength === 0) return 0;

    const normalizedSpotDir: Vec3 = [
      spotDir[0] / spotLength,
      spotDir[1] / spotLength,
      spotDir[2] / spotLength,
    ];

    // Calculate angle between light direction and spot direction
    const dotProduct = Math.max(
      -1,
      Math.min(
        1,
        lightDirection[0] * normalizedSpotDir[0] +
          lightDirection[1] * normalizedSpotDir[1] +
          lightDirection[2] * normalizedSpotDir[2],
      ),
    );

    const angle = (Math.acos(Math.abs(dotProduct)) * 180) / Math.PI;
    const halfAngle = light.spotAngle / 2;
    const penumbraStart = halfAngle - light.spotPenumbra;

    if (angle > halfAngle) {
      return 0; // Outside cone
    } else if (angle < penumbraStart) {
      return 1; // Full intensity
    } else {
      // In penumbra region
      return 1 - (angle - penumbraStart) / light.spotPenumbra;
    }
  }
}
