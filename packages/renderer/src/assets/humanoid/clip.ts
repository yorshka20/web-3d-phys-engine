import { quat, vec3 } from 'gl-matrix';
import type { GLTFAnimationSampler } from '../GltfModel';
import { sampleGLTFSampler } from '../gltfAnimations';
import {
  HUMANOID_GOALS,
  MUSCLE_COUNT,
  MUSCLES,
  type HumanoidGoal,
  type HumanoidRoot,
} from './humanoid';

/**
 * A humanoid clip as it ships in a clip glb (docs/hgrp-humanoid-animation.md §4): the body is
 * not baked into node channels but carried as muscle, root and goal curves — ordinary
 * animation samplers no channel targets, referenced by index from the animation's
 * `extras.HGRP_humanoid`. A viewer that ignores the extras still plays the secondary bones'
 * channels; the engine solves the body against the character it plays on, which is what makes
 * one clip file play on every character with an Avatar.
 */
export interface GLTFHumanoidClip {
  /** The Avatar the muscle values were authored against; informational, any Avatar plays it. */
  avatar: string;
  sampleRate: number;
  /** Unity's ClipMuscleConstant flags (loopTime, keepOriginalPositionY, …), verbatim. */
  settings: Record<string, unknown>;
  /** The body transform, normalized: translation is multiplied by the target rig's scale. */
  root?: { translation: GLTFAnimationSampler; rotation: GLTFAnimationSampler };
  goals: Partial<
    Record<HumanoidGoal, { translation: GLTFAnimationSampler; rotation: GLTFAnimationSampler }>
  >;
  /** Per MUSCLES index; undefined for a muscle the clip does not key (the default pose applies). */
  muscles: (GLTFAnimationSampler | undefined)[];
  /** Animator float parameters: `name` for the hashes the export could name (WeaponHide, …). */
  parameters: { name?: string; hash: number; sampler: GLTFAnimationSampler }[];
}

interface HumanoidExtrasJson {
  avatar: string;
  sampleRate: number;
  settings?: Record<string, unknown>;
  root?: { translation: number; rotation: number };
  goals?: Partial<Record<HumanoidGoal, { translation: number; rotation: number }>>;
  muscles: Record<string, number>;
  parameters?: { name?: string; hash: number; sampler: number }[];
}

/**
 * Read `extras.HGRP_humanoid` of an animation into sampler references. Returns undefined for an
 * animation without it; throws on one that names a sampler or muscle that does not exist.
 */
export function readHumanoidClipExtras(
  extras: unknown,
  samplers: readonly GLTFAnimationSampler[],
): GLTFHumanoidClip | undefined {
  const json = (extras as { HGRP_humanoid?: HumanoidExtrasJson } | undefined)?.HGRP_humanoid;
  if (!json) return undefined;
  const sampler = (index: number, what: string): GLTFAnimationSampler => {
    const found = samplers[index];
    if (!found)
      throw new Error(`HGRP_humanoid: ${what} names sampler ${index}, which does not exist`);
    return found;
  };
  const pair = (ref: { translation: number; rotation: number }, what: string) => ({
    translation: sampler(ref.translation, `${what} translation`),
    rotation: sampler(ref.rotation, `${what} rotation`),
  });
  const muscles: (GLTFAnimationSampler | undefined)[] = new Array(MUSCLE_COUNT).fill(undefined);
  for (const [name, index] of Object.entries(json.muscles ?? {})) {
    const m = (MUSCLES as readonly string[]).indexOf(name);
    if (m < 0) throw new Error(`HGRP_humanoid: unknown muscle ${name}`);
    muscles[m] = sampler(index, `muscle ${name}`);
  }
  const goals: GLTFHumanoidClip['goals'] = {};
  for (const goal of HUMANOID_GOALS) {
    const ref = json.goals?.[goal];
    if (ref) goals[goal] = pair(ref, `goal ${goal}`);
  }
  return {
    avatar: json.avatar,
    sampleRate: json.sampleRate,
    settings: json.settings ?? {},
    root: json.root ? pair(json.root, 'root') : undefined,
    goals,
    muscles,
    parameters: (json.parameters ?? []).map((p) => ({
      name: p.name,
      hash: p.hash,
      sampler: sampler(p.sampler, `parameter ${p.name ?? p.hash}`),
    })),
  };
}

const scratchScalar = new Float32Array(1);
const scratchVec3 = new Float32Array(3);
const scratchQuat = new Float32Array(4);

/**
 * The solver's inputs at `time`: the 55 muscle values and the body transform, each curve the
 * clip does not key taken from `defaults` — the character's own default pose, which is what
 * Unity's Animator leaves in place for a curve a clip lacks.
 */
export function sampleHumanoidClip(
  clip: GLTFHumanoidClip,
  time: number,
  defaults: { muscles: ArrayLike<number>; root: HumanoidRoot },
  musclesOut: Float64Array,
  rootOut: HumanoidRoot,
): void {
  for (let m = 0; m < MUSCLE_COUNT; m++) {
    const sampler = clip.muscles[m];
    if (sampler) {
      sampleGLTFSampler(sampler, time, 1, false, scratchScalar, 0);
      musclesOut[m] = scratchScalar[0];
    } else {
      musclesOut[m] = defaults.muscles[m];
    }
  }
  if (clip.root) {
    sampleGLTFSampler(clip.root.translation, time, 3, false, scratchVec3, 0);
    sampleGLTFSampler(clip.root.rotation, time, 4, true, scratchQuat, 0);
    vec3.set(rootOut.translation, scratchVec3[0], scratchVec3[1], scratchVec3[2]);
    quat.set(rootOut.rotation, scratchQuat[0], scratchQuat[1], scratchQuat[2], scratchQuat[3]);
  } else {
    vec3.copy(rootOut.translation, defaults.root.translation);
    quat.copy(rootOut.rotation, defaults.root.rotation);
  }
}

/**
 * The clip's Animator parameters at `time`, by name (`#<hash>` for one the export could not
 * name). `out` is cleared first: a parameter the clip does not carry has no value, which is
 * how a clip without a WeaponHide curve leaves the weapon shown.
 */
export function sampleHumanoidParameters(
  clip: GLTFHumanoidClip,
  time: number,
  out: Map<string, number>,
): void {
  out.clear();
  for (const parameter of clip.parameters) {
    sampleGLTFSampler(parameter.sampler, time, 1, false, scratchScalar, 0);
    out.set(parameter.name ?? `#${parameter.hash}`, scratchScalar[0]);
  }
}
