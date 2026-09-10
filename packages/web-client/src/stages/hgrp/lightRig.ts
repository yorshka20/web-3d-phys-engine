import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { Transform3DComponent } from '@ecs';
import { SceneLight, sceneLights } from '@renderer/webGPU/renderer/sceneLights';
import { mat3, mat4, vec3 } from 'gl-matrix';

import { HGRPStageCharacter, hgrpStage } from './characters';

// The per-character light rig: `lighting.json` next to the model is the character's Character
// Info light setup as the game ships it (41-67 lights), copied through by the converter. The
// engine reads it here — the rig is a stage concern, the way the roster and the placement are —
// and feeds the renderer's world-space light list every render tick, so a light follows its
// character when the placement, the global scale or the roster changes.
//
// Two facts settled the data (workbook 2026-09-11): the six `lightGroups` are a PARTITION of
// the light list (30 of 32 characters match exactly, group intensities being a permutation of
// the lights' own), so every light is part of one rig rather than one of six alternative
// presets; and `m_lightNPRData` is the light's parameter row for its type, verified against the
// named HGRP fields over all 1634 lights of the roster.

interface HGRPRigLight {
  // Unity Light.type: 0 spot, 2 point (the rig has no others)
  type: number;
  enabled: boolean;
  color: [number, number, number, number];
  intensity: number;
  range: number;
  spotAngle: number;
  innerSpotAngle: number;
  specularIntensity: number;
  name: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  };
  hgrp: {
    m_lightNPRType: number;
    m_lightNPRData: { x: number; y: number; z: number; w: number };
    m_falloffExponent: number;
    m_LightCharacterOnly: number;
  };
}

interface HGRPLightRigFile {
  character: string;
  lights: HGRPRigLight[];
}

// A light of one character's rig, already in the character's MODEL space: Unity's x mirrored
// (the export's handedness convention — the FBX world is Unity's mirrored in x, so the glb's is
// too) and the rig's ground origin moved onto the model's feet.
interface RigLight {
  position: vec3;
  direction: vec3;
  color: [number, number, number];
  range: number;
  falloffExponent: number;
  cosOuterAngle: number;
  spotAngleScale: number;
  isSpot: boolean;
  nprType: number;
  nprParams: [number, number, number, number];
  specularIntensity: number;
}

// The character shader skips this type outright (b451: `_2634 == 16u` continues), so it never
// reaches the buffer. It is the scene's floor light, not a character light.
const NPR_TYPE_SCENE = 16;

const rigs = new Map<string, RigLight[]>();

export const hgrpLightRig = {
  // What the panel reports: how many lights the loaded rigs hold in total
  loaded: 0,
};

// Unity serializes a light's color as authored (gamma); HDRP-derived pipelines multiply the
// LINEAR color by the intensity into the light buffer, so decode here. The rig's colors are
// near-white tints, except the warm point lights where the difference is visible.
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseRig(file: HGRPLightRigFile, anchor: readonly [number, number, number]): RigLight[] {
  const lights: RigLight[] = [];
  for (const light of file.lights) {
    if (!light.enabled || light.hgrp.m_lightNPRType === NPR_TYPE_SCENE) {
      continue;
    }
    const [px, py, pz] = light.transform.position;
    const [qx, qy, qz, qw] = light.transform.rotation;
    // Unity's forward (0, 0, 1) turned by the light's rotation, then mirrored in x with the
    // position — a mirror negates the x of a direction as well.
    const forward: vec3 = [
      -(2 * (qx * qz + qw * qy)),
      2 * (qy * qz - qw * qx),
      1 - 2 * (qx * qx + qy * qy),
    ];
    const isSpot = light.type === 0;
    const cosOuter = Math.cos((light.spotAngle * Math.PI) / 360);
    const cosInner = Math.cos((light.innerSpotAngle * Math.PI) / 360);
    lights.push({
      position: [anchor[0] - px, anchor[1] + py, anchor[2] + pz],
      direction: vec3.normalize(forward, forward),
      color: [
        srgbToLinear(light.color[0]) * light.intensity,
        srgbToLinear(light.color[1]) * light.intensity,
        srgbToLinear(light.color[2]) * light.intensity,
      ],
      range: light.range,
      falloffExponent: light.hgrp.m_falloffExponent,
      cosOuterAngle: cosOuter,
      spotAngleScale: 1 / Math.max(cosInner - cosOuter, 1e-4),
      isSpot,
      nprType: light.hgrp.m_lightNPRType,
      nprParams: [
        light.hgrp.m_lightNPRData.x,
        light.hgrp.m_lightNPRData.y,
        light.hgrp.m_lightNPRData.z,
        light.hgrp.m_lightNPRData.w,
      ],
      specularIntensity: light.specularIntensity,
    });
  }
  return lights;
}

// Fetched when a character is switched on, next to its model. A character without a rig
// (`chenpast`, `jsspsi`, `purrche` have no Character Info prefab in the client build) simply
// contributes no lights.
export async function loadHGRPLightRig(character: HGRPStageCharacter): Promise<void> {
  const url = character.source.lightingUrl;
  if (!url || rigs.has(character.assetId)) {
    return;
  }
  const file = (await (await fetch(url)).json()) as HGRPLightRigFile;
  const rig = parseRig(file, character.anchor);
  rigs.set(character.assetId, rig);
  hgrpLightRig.loaded = [...rigs.values()].reduce((sum, lights) => sum + lights.length, 0);
  console.log(`[hgrp] ${character.label}: light rig ${rig.length} lights`);
}

const scratchPosition = vec3.create();
const scratchDirection = vec3.create();
const scratchRotation = mat3.create();

// The world-space lights handed to the renderer, rebuilt in place: the rig runs to a few
// hundred lights and this is a per-frame path, so the objects are pooled rather than allocated.
const pool: SceneLight[] = [];
const active: SceneLight[] = [];

function pooled(index: number): SceneLight {
  const existing = pool[index];
  if (existing) {
    return existing;
  }
  const light: SceneLight = {
    position: [0, 0, 0],
    color: [0, 0, 0],
    range: 0,
    falloffExponent: 0,
    spotDirection: [0, 0, 0],
    cosOuterAngle: 0,
    spotAngleScale: 0,
    isSpot: false,
    nprType: 0,
    nprParams: [0, 0, 0, 0],
    specularIntensity: 1,
  };
  pool[index] = light;
  return light;
}

// Rebuilt every render tick rather than cached per placement change: the rig has to follow the
// character's transform, and a few hundred point transforms per frame is nothing next to
// tracking every way the placement can move (panel, global scale, relayout).
export class HGRPLightRigSystem extends System {
  constructor() {
    super('HGRPLightRigSystem', SystemPriorities.ANIMATION_DRIVEN, 'render');
  }

  update(): void {
    active.length = 0;
    for (const character of hgrpStage.characters) {
      const rig = rigs.get(character.assetId);
      if (!rig || !character.visible || !character.entity) {
        continue;
      }
      const transform = character.entity.getComponent<Transform3DComponent>(
        Transform3DComponent.componentName,
      );
      if (!transform) {
        continue;
      }
      const world = transform.getWorldMatrix() as unknown as mat4;
      mat3.fromMat4(scratchRotation, world);
      for (const light of rig) {
        vec3.transformMat4(scratchPosition, light.position, world);
        vec3.transformMat3(scratchDirection, light.direction, scratchRotation);
        vec3.normalize(scratchDirection, scratchDirection);
        const out = pooled(active.length);
        vec3.copy(out.position as vec3, scratchPosition);
        vec3.copy(out.spotDirection as vec3, scratchDirection);
        out.color[0] = light.color[0];
        out.color[1] = light.color[1];
        out.color[2] = light.color[2];
        // In the assets' metres, as authored: the shading converts the world distance into
        // that space through the draw's own model scale, like every other HGRP length.
        out.range = light.range;
        out.falloffExponent = light.falloffExponent;
        out.cosOuterAngle = light.cosOuterAngle;
        out.spotAngleScale = light.spotAngleScale;
        out.isSpot = light.isSpot;
        out.nprType = light.nprType;
        out.nprParams[0] = light.nprParams[0];
        out.nprParams[1] = light.nprParams[1];
        out.nprParams[2] = light.nprParams[2];
        out.nprParams[3] = light.nprParams[3];
        out.specularIntensity = light.specularIntensity;
        active.push(out);
      }
    }
    sceneLights.lights = active;
  }
}
