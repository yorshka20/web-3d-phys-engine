// The punctual light rig the HGRP character shading reads: the game's per-character Character
// Info lights (`lighting.json`, 41-67 per character), which its forward pass walks as
// `_LightDataBuffer_PunctualLightData` (hgrp-decompiled-formulas.md §1.11). Positions are WORLD
// space here — a stage owns the placement and rebuilds the rig when a character moves — and the
// buffer holds every character's lights at once, each rejected by its own range.
//
// Module-scoped singleton for the same reason as sceneSettings: this is pass-level state that
// belongs to no material and no entity.

// One light as the shading reads it. `nprType` selects which of the game's four character-light
// formulas applies, and `nprParams` is that type's parameter row — the light's `m_lightNPRData`,
// whose meaning per type was pinned against the named HGRP fields over the whole roster:
//
//   0 diffuse  (contrast, autoLimit, -, -)          wrap floor, blowout normalization
//   1 ramp     (rampBias, -, -, -)                  n.l bias, no fill floor
//   2 specular (maxRoughness, roughnessBias, metalOnly, -)   adds a highlight only
//   3 rim      (rimWidth, albedoAlpha, -, -)        a rim ring, no specular
//   4 fog      (fogAlpha, falloffFactor, directional, rampBias)  lerps the pixel to its color
//   16         skipped by the character shader entirely (the scene's floor light)
// Mutable on purpose: the stage's rig system rewrites these in place every render tick rather
// than allocating a few hundred objects per frame.
export interface SceneLight {
  // World space
  position: [number, number, number];
  // Linear light, already multiplied by the light's intensity
  color: [number, number, number];
  // World units; beyond it the light contributes nothing
  range: number;
  // The game's `m_falloffExponent`: < 0 selects the URP curve 1/(d^2+1) x (1 - (d/r)^4)^2,
  // >= 0 the exponential (1 - (d/r)^2)^exponent
  falloffExponent: number;
  // The direction the light shines, world space; a point light leaves it zero
  spotDirection: [number, number, number];
  cosOuterAngle: number;
  // 1 / (cos(inner) - cos(outer)), the cone's edge slope
  spotAngleScale: number;
  isSpot: boolean;
  nprType: number;
  nprParams: [number, number, number, number];
  specularIntensity: number;
}

export const sceneLights = {
  // Off until a stage fills the rig; the HGRP shading reads the count out of the SceneLighting
  // uniform, so an empty rig costs nothing per fragment.
  lights: [] as SceneLight[],
  // Whether the rig is fed to the GPU at all — the stage's switch, so the picture can be
  // compared against the key-light-only lighting the shading was calibrated with.
  enabled: false,
  // Multiplier on every light's color. The game's C# side converts a Unity light's `intensity`
  // into the radiance it writes into the light buffer, and that conversion is not in the rip
  // (guess ledger): 1 means "the intensity is the radiance", as URP's unitless punctual lights
  // work, which is what the `m_falloffExponent < 0` curve above belongs to.
  intensityScale: 1,
  // Per-type switches, for telling the four formulas apart on screen.
  types: { diffuse: true, ramp: true, specular: true, rim: true, fog: true },
};

// vec4s per light in the storage buffer; see packSceneLights for the field order.
const LIGHT_VEC4S = 5;
export const SCENE_LIGHT_FLOATS = LIGHT_VEC4S * 4;
export const SCENE_LIGHT_BYTE_SIZE = SCENE_LIGHT_FLOATS * 4;

// The buffer is allocated once at this size: a roster of six characters is around 300 lights.
export const SCENE_LIGHT_CAPACITY = 512;

function typeEnabled(nprType: number): boolean {
  const { types } = sceneLights;
  switch (nprType) {
    case 0:
      return types.diffuse;
    case 1:
      return types.ramp;
    case 2:
      return types.specular;
    case 3:
      return types.rim;
    case 4:
      return types.fog;
    default:
      return false;
  }
}

// How many lights the rig would contribute this frame, for the panel's readout.
export function activeSceneLightCount(): number {
  if (!sceneLights.enabled) {
    return 0;
  }
  let count = 0;
  for (const light of sceneLights.lights) {
    if (typeEnabled(light.nprType)) {
      count++;
    }
  }
  return Math.min(count, SCENE_LIGHT_CAPACITY);
}

// Writes the active lights into `out` and returns how many were written (the count the shading
// loops to, carried in SceneLighting.env_stand_in.w).
export function packSceneLights(out: Float32Array): number {
  if (!sceneLights.enabled) {
    return 0;
  }
  const scale = sceneLights.intensityScale;
  let count = 0;
  for (const light of sceneLights.lights) {
    if (count >= SCENE_LIGHT_CAPACITY || !typeEnabled(light.nprType)) {
      continue;
    }
    const at = count * SCENE_LIGHT_FLOATS;
    count++;
    out[at + 0] = light.position[0];
    out[at + 1] = light.position[1];
    out[at + 2] = light.position[2];
    out[at + 3] = light.range;
    out[at + 4] = light.color[0] * scale;
    out[at + 5] = light.color[1] * scale;
    out[at + 6] = light.color[2] * scale;
    out[at + 7] = light.falloffExponent;
    out[at + 8] = light.spotDirection[0];
    out[at + 9] = light.spotDirection[1];
    out[at + 10] = light.spotDirection[2];
    out[at + 11] = light.cosOuterAngle;
    out[at + 12] = light.spotAngleScale;
    out[at + 13] = light.nprType;
    out[at + 14] = light.specularIntensity;
    out[at + 15] = light.isSpot ? 1 : 0;
    out[at + 16] = light.nprParams[0];
    out[at + 17] = light.nprParams[1];
    out[at + 18] = light.nprParams[2];
    out[at + 19] = light.nprParams[3];
  }
  return count;
}
