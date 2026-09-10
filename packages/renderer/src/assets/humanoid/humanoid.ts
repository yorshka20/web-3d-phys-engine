import { mat3, mat4, quat, vec3 } from 'gl-matrix';

/**
 * Unity Humanoid (Mecanim) retargeting: an Avatar's human skeleton plus the muscle-space
 * representation of a pose, and the solver that turns muscle values back into bone transforms.
 *
 * A humanoid clip does not store the body's bone rotations. It stores, per frame, 55 muscle
 * values (one per rotational degree of freedom of the 25 human bones, nominally in [-1, 1]),
 * the body's root transform and the four IK goals, all independent of the character's
 * proportions. The Avatar carries what maps them onto a specific skeleton: per bone a pair of
 * frame quaternions (preQ, postQ), a sign per axis, the angular limits the muscle values scale,
 * the bone length, the T-pose, and the per-bone masses the root transform is defined from.
 *
 * Everything here is in Unity's own space (left-handed, +y up, the export's Avatar values
 * verbatim). The formulas are a reconstruction, pinned against the export's data
 * (docs/hgrp-humanoid-animation.md §1): the T-pose clip's muscles equal the bind pose inverted
 * through them, and the solved hands and feet land on the clips' own IK goals to 0.2 mm.
 */

/** The 25 human bones in Mecanim's internal order — the order the Avatar's bone tables use. */
export const HUMAN_BONES = [
  'Hips',
  'LeftUpperLeg',
  'RightUpperLeg',
  'LeftLowerLeg',
  'RightLowerLeg',
  'LeftFoot',
  'RightFoot',
  'Spine',
  'Chest',
  'UpperChest',
  'Neck',
  'Head',
  'LeftShoulder',
  'RightShoulder',
  'LeftUpperArm',
  'RightUpperArm',
  'LeftLowerArm',
  'RightLowerArm',
  'LeftHand',
  'RightHand',
  'LeftToes',
  'RightToes',
  'LeftEye',
  'RightEye',
  'Jaw',
] as const;
export type HumanBone = (typeof HUMAN_BONES)[number];
export const HUMAN_BONE_COUNT = HUMAN_BONES.length;

/**
 * The 55 body muscles in Unity's `HumanTrait.MuscleName` order, which is also Mecanim's DoF
 * order: body (21), left leg (8), right leg (8), left arm (9), right arm (9). Finger muscles
 * (40 more in HumanTrait) are not represented; no Avatar of this project has finger bones.
 */
export const MUSCLES = [
  'Spine Front-Back',
  'Spine Left-Right',
  'Spine Twist Left-Right',
  'Chest Front-Back',
  'Chest Left-Right',
  'Chest Twist Left-Right',
  'UpperChest Front-Back',
  'UpperChest Left-Right',
  'UpperChest Twist Left-Right',
  'Neck Nod Down-Up',
  'Neck Tilt Left-Right',
  'Neck Turn Left-Right',
  'Head Nod Down-Up',
  'Head Tilt Left-Right',
  'Head Turn Left-Right',
  'Left Eye Down-Up',
  'Left Eye In-Out',
  'Right Eye Down-Up',
  'Right Eye In-Out',
  'Jaw Close',
  'Jaw Left-Right',
  'Left Upper Leg Front-Back',
  'Left Upper Leg In-Out',
  'Left Upper Leg Twist In-Out',
  'Left Lower Leg Stretch',
  'Left Lower Leg Twist In-Out',
  'Left Foot Up-Down',
  'Left Foot Twist In-Out',
  'Left Toes Up-Down',
  'Right Upper Leg Front-Back',
  'Right Upper Leg In-Out',
  'Right Upper Leg Twist In-Out',
  'Right Lower Leg Stretch',
  'Right Lower Leg Twist In-Out',
  'Right Foot Up-Down',
  'Right Foot Twist In-Out',
  'Right Toes Up-Down',
  'Left Shoulder Down-Up',
  'Left Shoulder Front-Back',
  'Left Arm Down-Up',
  'Left Arm Front-Back',
  'Left Arm Twist In-Out',
  'Left Forearm Stretch',
  'Left Forearm Twist In-Out',
  'Left Hand Down-Up',
  'Left Hand In-Out',
  'Right Shoulder Down-Up',
  'Right Shoulder Front-Back',
  'Right Arm Down-Up',
  'Right Arm Front-Back',
  'Right Arm Twist In-Out',
  'Right Forearm Stretch',
  'Right Forearm Twist In-Out',
  'Right Hand Down-Up',
  'Right Hand In-Out',
] as const;
export const MUSCLE_COUNT = MUSCLES.length;

// Which muscle drives each axis (x = twist along the bone, y, z) of each human bone, by
// HUMAN_BONES index; -1 when the axis has no muscle. The axes' limits in the Avatar say which
// is which: a bone's twist range is its x limit, its two swings y and z.
const M = (name: (typeof MUSCLES)[number]) => MUSCLES.indexOf(name);
export const BONE_MUSCLES: readonly (readonly [number, number, number])[] = [
  [-1, -1, -1], // Hips: no muscles, placed by the root transform
  [M('Left Upper Leg Twist In-Out'), M('Left Upper Leg In-Out'), M('Left Upper Leg Front-Back')],
  [M('Right Upper Leg Twist In-Out'), M('Right Upper Leg In-Out'), M('Right Upper Leg Front-Back')],
  [M('Left Lower Leg Twist In-Out'), -1, M('Left Lower Leg Stretch')],
  [M('Right Lower Leg Twist In-Out'), -1, M('Right Lower Leg Stretch')],
  [-1, M('Left Foot Twist In-Out'), M('Left Foot Up-Down')],
  [-1, M('Right Foot Twist In-Out'), M('Right Foot Up-Down')],
  [M('Spine Twist Left-Right'), M('Spine Left-Right'), M('Spine Front-Back')],
  [M('Chest Twist Left-Right'), M('Chest Left-Right'), M('Chest Front-Back')],
  [M('UpperChest Twist Left-Right'), M('UpperChest Left-Right'), M('UpperChest Front-Back')],
  [M('Neck Turn Left-Right'), M('Neck Tilt Left-Right'), M('Neck Nod Down-Up')],
  [M('Head Turn Left-Right'), M('Head Tilt Left-Right'), M('Head Nod Down-Up')],
  [-1, M('Left Shoulder Front-Back'), M('Left Shoulder Down-Up')],
  [-1, M('Right Shoulder Front-Back'), M('Right Shoulder Down-Up')],
  [M('Left Arm Twist In-Out'), M('Left Arm Front-Back'), M('Left Arm Down-Up')],
  [M('Right Arm Twist In-Out'), M('Right Arm Front-Back'), M('Right Arm Down-Up')],
  [M('Left Forearm Twist In-Out'), -1, M('Left Forearm Stretch')],
  [M('Right Forearm Twist In-Out'), -1, M('Right Forearm Stretch')],
  [-1, M('Left Hand In-Out'), M('Left Hand Down-Up')],
  [-1, M('Right Hand In-Out'), M('Right Hand Down-Up')],
  [-1, M('Left Toes Up-Down'), -1],
  [-1, M('Right Toes Up-Down'), -1],
  [-1, M('Left Eye In-Out'), M('Left Eye Down-Up')],
  [-1, M('Right Eye In-Out'), M('Right Eye Down-Up')],
  [-1, M('Jaw Left-Right'), M('Jaw Close')],
];

export const HUMANOID_GOALS = ['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'] as const;
export type HumanoidGoal = (typeof HUMANOID_GOALS)[number];

/** A bone's muscle frame: `local = preQ · ZYRoll(angles) · postQ⁻¹`, limits in radians. */
export interface HumanoidAxes {
  preQ: quat;
  postQ: quat;
  sgn: vec3;
  limitMin: vec3;
  limitMax: vec3;
  length: number;
}

/** One node of the Avatar's human skeleton, at its T-pose local transform. */
export interface HumanoidRigNode {
  path: string;
  parent: number;
  translation: vec3;
  rotation: quat;
  scale: vec3;
  axes?: HumanoidAxes;
}

export interface HumanoidRig {
  name: string;
  nodes: HumanoidRigNode[];
  /** Node index per HUMAN_BONES entry, -1 when the rig lacks the bone. */
  bones: Int32Array;
  /** Mass per HUMAN_BONES entry (sums to 1). */
  masses: Float32Array;
  /** The T-pose body transform, metres. */
  rootTranslation: vec3;
  rootRotation: quat;
  /** Unity's human scale: the clip's root and goal translations are divided by it. */
  scale: number;
}

/** Local TRS of every rig node, the solver's output. */
export interface HumanoidPose {
  translations: Float64Array;
  rotations: Float64Array;
  scales: Float64Array;
}

/** The body transform of a frame as the clip stores it: normalized translation, rotation. */
export interface HumanoidRoot {
  translation: vec3;
  rotation: quat;
}

// ---- the export's avatar.json ---------------------------------------------------------------

interface AvatarJsonAxes {
  preQ: number[];
  postQ: number[];
  sgn: number[];
  limitMin: number[];
  limitMax: number[];
  length: number;
  type: number;
}
interface AvatarJsonNode {
  index: number;
  path: string;
  parent: number;
  tPose: number[];
  axes: AvatarJsonAxes | null;
}
interface AvatarJson {
  name: string;
  rootX: number[];
  scale: number;
  skeleton: AvatarJsonNode[];
  humanBones: { humanBone: number; skeletonIndex: number; mass: number }[];
}

/**
 * Read the export's `avatar.json` (the Unity Avatar's `m_Human`, values verbatim; see
 * docs/hgrp-humanoid-animation.md §3.1). Throws on anything the solver cannot use.
 */
export function parseAvatar(json: unknown): HumanoidRig {
  const a = json as AvatarJson;
  if (!Array.isArray(a?.skeleton) || !Array.isArray(a.humanBones) || !a.rootX) {
    throw new Error('avatar.json: expected skeleton[], humanBones[] and rootX');
  }
  const nodes = a.skeleton.map((n, i): HumanoidRigNode => {
    if (n.index !== i || n.tPose?.length !== 10) {
      throw new Error(`avatar.json: skeleton[${i}] is out of order or lacks a 10-float tPose`);
    }
    if (n.parent >= i) {
      throw new Error(`avatar.json: skeleton[${i}] (${n.path}) is listed before its parent`);
    }
    const node: HumanoidRigNode = {
      path: n.path,
      parent: n.parent,
      translation: vec3.fromValues(n.tPose[0], n.tPose[1], n.tPose[2]),
      rotation: quat.fromValues(n.tPose[3], n.tPose[4], n.tPose[5], n.tPose[6]),
      scale: vec3.fromValues(n.tPose[7], n.tPose[8], n.tPose[9]),
    };
    if (n.axes) {
      // Type 1 is ZYRoll, the only parametrisation this solver implements (every axis of every
      // Avatar in the export is type 1; Euler axes never appear on a humanoid rig).
      if (n.axes.type !== 1) {
        throw new Error(
          `avatar.json: ${n.path} has axes type ${n.axes.type}, only 1 (ZYRoll) is supported`,
        );
      }
      node.axes = {
        preQ: quat.fromValues(n.axes.preQ[0], n.axes.preQ[1], n.axes.preQ[2], n.axes.preQ[3]),
        postQ: quat.fromValues(n.axes.postQ[0], n.axes.postQ[1], n.axes.postQ[2], n.axes.postQ[3]),
        sgn: vec3.fromValues(n.axes.sgn[0], n.axes.sgn[1], n.axes.sgn[2]),
        limitMin: vec3.fromValues(n.axes.limitMin[0], n.axes.limitMin[1], n.axes.limitMin[2]),
        limitMax: vec3.fromValues(n.axes.limitMax[0], n.axes.limitMax[1], n.axes.limitMax[2]),
        length: n.axes.length,
      };
    }
    return node;
  });
  const bones = new Int32Array(HUMAN_BONE_COUNT).fill(-1);
  const masses = new Float32Array(HUMAN_BONE_COUNT);
  for (const hb of a.humanBones) {
    if (hb.humanBone < 0 || hb.humanBone >= HUMAN_BONE_COUNT) {
      throw new Error(`avatar.json: humanBone ${hb.humanBone} is out of range`);
    }
    bones[hb.humanBone] = hb.skeletonIndex;
    masses[hb.humanBone] = hb.mass;
    if (hb.skeletonIndex >= 0 && !nodes[hb.skeletonIndex]?.axes && hb.humanBone !== 0) {
      throw new Error(`avatar.json: ${HUMAN_BONES[hb.humanBone]} has no axes`);
    }
  }
  if (bones[0] < 0) throw new Error('avatar.json: the rig has no Hips');
  return {
    name: a.name,
    nodes,
    bones,
    masses,
    rootTranslation: vec3.fromValues(a.rootX[0], a.rootX[1], a.rootX[2]),
    rootRotation: quat.fromValues(a.rootX[3], a.rootX[4], a.rootX[5], a.rootX[6]),
    scale: a.scale,
  };
}

// ---- muscle space -----------------------------------------------------------------------------

/** A muscle value scales its axis' limit: the max side when positive, the min side when negative. */
export function limitProject(axes: HumanoidAxes, value: number, axis: number): number {
  return value > 0 ? value * axes.limitMax[axis] : -value * axes.limitMin[axis];
}

/**
 * Mecanim's ZYRoll chart of a rotation: three tan-half-angle coordinates, x the twist. Any
 * triple gives a unit quaternion once normalised, and single-axis rotations come out exact.
 */
export function zyRollToQuat(out: quat, v: vec3): quat {
  quat.set(out, v[0], v[1] + v[0] * v[2], v[2] - v[0] * v[1], 1);
  return quat.normalize(out, out);
}

/** Inverse of zyRollToQuat: the chart's coordinates of a unit quaternion. */
export function zyRollFromQuat(out: vec3, q: quat): vec3 {
  const w = q[3] === 0 ? Number.EPSILON : q[3];
  const x = q[0] / w;
  const y = q[1] / w;
  const z = q[2] / w;
  const d = 1 + x * x;
  return vec3.set(out, x, (y - x * z) / d, (z + x * y) / d);
}

/** Inverse of limitProject; an axis with a zero limit has no muscle and reads 0. */
export function limitUnproject(axes: HumanoidAxes, angle: number, axis: number): number {
  if (angle > 0) return axes.limitMax[axis] === 0 ? 0 : angle / axes.limitMax[axis];
  return axes.limitMin[axis] === 0 ? 0 : -angle / axes.limitMin[axis];
}

const scratchZyRoll = vec3.create();
const scratchSwing = quat.create();
const scratchPostInverse = quat.create();
const scratchPreInverse = quat.create();

/** Local rotation of a bone from its three muscle values (x, y, z order of its axes). */
export function rotationFromMuscles(out: quat, axes: HumanoidAxes, muscles: vec3): quat {
  for (let i = 0; i < 3; i++) {
    scratchZyRoll[i] = Math.tan(0.5 * limitProject(axes, muscles[i], i) * axes.sgn[i]);
  }
  zyRollToQuat(scratchSwing, scratchZyRoll);
  quat.multiply(out, axes.preQ, scratchSwing);
  quat.multiply(out, out, quat.conjugate(scratchPostInverse, axes.postQ));
  return quat.normalize(out, out);
}

/**
 * The three muscle values that produce a bone's local rotation (the inverse of
 * rotationFromMuscles): how Unity reads a posed skeleton back into muscle space, and how a
 * character's default pose is expressed for the curves a clip leaves out.
 */
export function musclesFromRotation(out: vec3, axes: HumanoidAxes, rotation: quat): vec3 {
  quat.multiply(scratchSwing, quat.conjugate(scratchPreInverse, axes.preQ), rotation);
  quat.multiply(scratchSwing, scratchSwing, axes.postQ);
  if (scratchSwing[3] < 0) quat.scale(scratchSwing, scratchSwing, -1);
  zyRollFromQuat(scratchZyRoll, scratchSwing);
  for (let i = 0; i < 3; i++) {
    out[i] = limitUnproject(axes, 2 * Math.atan(scratchZyRoll[i]) * axes.sgn[i], i);
  }
  return out;
}

const scratchParentInv = quat.create();
const scratchLocalQ = quat.create();
const scratchMuscleTriple = vec3.create();

/**
 * Express a posed rig's human bones as the 55 muscle values (MUSCLES order) that reproduce
 * their local rotations; axes without a muscle are skipped.
 */
export function musclesFromWorld(
  out: Float64Array,
  rig: HumanoidRig,
  worlds: Float64Array,
): Float64Array {
  out.fill(0);
  for (let bone = 0; bone < HUMAN_BONE_COUNT; bone++) {
    const index = rig.bones[bone];
    if (index < 0) continue;
    const axes = rig.nodes[index].axes;
    const map = BONE_MUSCLES[bone];
    if (!axes || (map[0] < 0 && map[1] < 0 && map[2] < 0)) continue;
    mat4.getRotation(
      scratchLocalQ,
      worlds.subarray(index * 16, index * 16 + 16) as unknown as mat4,
    );
    const parent = rig.nodes[index].parent;
    if (parent >= 0) {
      mat4.getRotation(
        scratchParentInv,
        worlds.subarray(parent * 16, parent * 16 + 16) as unknown as mat4,
      );
      quat.conjugate(scratchParentInv, quat.normalize(scratchParentInv, scratchParentInv));
      quat.multiply(scratchLocalQ, scratchParentInv, scratchLocalQ);
    }
    quat.normalize(scratchLocalQ, scratchLocalQ);
    musclesFromRotation(scratchMuscleTriple, axes, scratchLocalQ);
    for (let c = 0; c < 3; c++) if (map[c] >= 0) out[map[c]] = scratchMuscleTriple[c];
  }
  return out;
}

export function createHumanoidPose(rig: HumanoidRig): HumanoidPose {
  const n = rig.nodes.length;
  return {
    translations: new Float64Array(n * 3),
    rotations: new Float64Array(n * 4),
    scales: new Float64Array(n * 3),
  };
}

/** Reset a pose to the rig's T-pose. */
export function setTPose(rig: HumanoidRig, pose: HumanoidPose): HumanoidPose {
  rig.nodes.forEach((node, i) => {
    pose.translations.set(node.translation, i * 3);
    pose.rotations.set(node.rotation, i * 4);
    pose.scales.set(node.scale, i * 3);
  });
  return pose;
}

const scratchMuscles = vec3.create();
const scratchRotation = quat.create();

/**
 * Write the muscle-driven bones' local rotations into `pose`; every other node keeps what it
 * had (the hips are positioned separately by placeHips).
 */
export function applyMuscles(
  rig: HumanoidRig,
  muscles: ArrayLike<number>,
  muscleOffset: number,
  pose: HumanoidPose,
): void {
  for (let bone = 0; bone < HUMAN_BONE_COUNT; bone++) {
    const index = rig.bones[bone];
    if (index < 0) continue;
    const axes = rig.nodes[index].axes;
    const map = BONE_MUSCLES[bone];
    if (!axes || (map[0] < 0 && map[1] < 0 && map[2] < 0)) continue;
    for (let c = 0; c < 3; c++) {
      scratchMuscles[c] = map[c] >= 0 ? muscles[muscleOffset + map[c]] : 0;
    }
    rotationFromMuscles(scratchRotation, axes, scratchMuscles);
    pose.rotations.set(scratchRotation, index * 4);
  }
}

const scratchLocal = mat4.create();

/** Compose the pose's local TRS down the rig's hierarchy; `out` holds 16 floats per node. */
export function composeRigWorld(
  rig: HumanoidRig,
  pose: HumanoidPose,
  out: Float64Array,
): Float64Array {
  for (let i = 0; i < rig.nodes.length; i++) {
    mat4.fromRotationTranslationScale(
      scratchLocal,
      pose.rotations.subarray(i * 4, i * 4 + 4) as unknown as quat,
      pose.translations.subarray(i * 3, i * 3 + 3) as unknown as vec3,
      pose.scales.subarray(i * 3, i * 3 + 3) as unknown as vec3,
    );
    const world = out.subarray(i * 16, i * 16 + 16) as unknown as mat4;
    const parent = rig.nodes[i].parent;
    if (parent < 0) mat4.copy(world, scratchLocal);
    else
      mat4.multiply(
        world,
        out.subarray(parent * 16, parent * 16 + 16) as unknown as mat4,
        scratchLocal,
      );
  }
  return out;
}

const worldOf = (worlds: Float64Array, index: number) =>
  worlds.subarray(index * 16, index * 16 + 16) as unknown as mat4;

const scratchP = vec3.create();
const scratchQ = quat.create();
const scratchAxis = vec3.create();

/** World position of a rig node. */
function nodePosition(out: vec3, worlds: Float64Array, index: number): vec3 {
  return mat4.getTranslation(out, worldOf(worlds, index));
}

/** World rotation of a bone's muscle frame (bone rotation · postQ); its x axis runs along the bone. */
function axesRotation(out: quat, rig: HumanoidRig, worlds: Float64Array, index: number): quat {
  mat4.getRotation(out, worldOf(worlds, index));
  quat.normalize(out, out);
  return quat.multiply(out, out, rig.nodes[index].axes!.postQ);
}

/**
 * The mass centre of a pose: each human bone's mass at the midpoint of its axis (its length
 * along the muscle frame's x). Measured against the export's clips this reproduces the stored
 * body position to a few millimetres once expressed as a displacement from the T-pose
 * (bodyTransform); the exact rule Unity uses is not pinned (docs/hgrp-humanoid-animation.md §6).
 */
export function massCentre(out: vec3, rig: HumanoidRig, worlds: Float64Array): vec3 {
  vec3.zero(out);
  for (let bone = 0; bone < HUMAN_BONE_COUNT; bone++) {
    const index = rig.bones[bone];
    const mass = rig.masses[bone];
    if (index < 0 || mass === 0) continue;
    nodePosition(scratchP, worlds, index);
    const axes = rig.nodes[index].axes;
    if (axes) {
      axesRotation(scratchQ, rig, worlds, index);
      vec3.set(scratchAxis, 0.5 * axes.length, 0, 0);
      vec3.transformQuat(scratchAxis, scratchAxis, scratchQ);
      vec3.add(scratchP, scratchP, scratchAxis);
    }
    vec3.scaleAndAdd(out, out, scratchP, mass);
  }
  return out;
}

const scratchUp = vec3.create();
const scratchSide = vec3.create();
const scratchFront = vec3.create();
const scratchA = vec3.create();
const scratchB = vec3.create();
const scratchM3 = mat3.create();

/**
 * The body orientation of a pose: up is the line from the hip joints' midpoint to the
 * shoulder joints' midpoint, the left-right axis the sum of the right-minus-left upper-leg and
 * upper-arm vectors (Unity's "average of the lower and upper body orientation"), projected onto
 * the plane perpendicular to up. Measured: 0.1° from the stored body rotation.
 */
export function bodyOrientation(out: quat, rig: HumanoidRig, worlds: Float64Array): quat {
  const b = (name: HumanBone) => rig.bones[HUMAN_BONES.indexOf(name)];
  const lLeg = nodePosition(vec3.create(), worlds, b('LeftUpperLeg'));
  const rLeg = nodePosition(vec3.create(), worlds, b('RightUpperLeg'));
  const lArm = nodePosition(vec3.create(), worlds, b('LeftUpperArm'));
  const rArm = nodePosition(vec3.create(), worlds, b('RightUpperArm'));
  vec3.add(scratchA, lArm, rArm);
  vec3.add(scratchB, lLeg, rLeg);
  vec3.sub(scratchUp, scratchA, scratchB);
  vec3.normalize(scratchUp, scratchUp);
  vec3.sub(scratchSide, rLeg, lLeg);
  vec3.sub(scratchA, rArm, lArm);
  vec3.add(scratchSide, scratchSide, scratchA);
  vec3.cross(scratchFront, scratchSide, scratchUp);
  vec3.normalize(scratchFront, scratchFront);
  vec3.cross(scratchSide, scratchUp, scratchFront);
  mat3.set(
    scratchM3,
    scratchSide[0],
    scratchSide[1],
    scratchSide[2],
    scratchUp[0],
    scratchUp[1],
    scratchUp[2],
    scratchFront[0],
    scratchFront[1],
    scratchFront[2],
  );
  quat.fromMat3(out, scratchM3);
  return quat.normalize(out, out);
}

const scratchTPose = new WeakMap<HumanoidRig, { worlds: Float64Array; centre: vec3 }>();
function tPoseReference(rig: HumanoidRig): { worlds: Float64Array; centre: vec3 } {
  let ref = scratchTPose.get(rig);
  if (!ref) {
    const worlds = composeRigWorld(
      rig,
      setTPose(rig, createHumanoidPose(rig)),
      new Float64Array(rig.nodes.length * 16),
    );
    ref = { worlds, centre: massCentre(vec3.create(), rig, worlds) };
    scratchTPose.set(rig, ref);
  }
  return ref;
}

/**
 * The body transform of a pose in the rig's root space, metres: the Avatar's T-pose root
 * displaced by the mass centre's movement from the T-pose, oriented by bodyOrientation.
 */
export function bodyTransform(
  outTranslation: vec3,
  outRotation: quat,
  rig: HumanoidRig,
  worlds: Float64Array,
): void {
  const ref = tPoseReference(rig);
  massCentre(outTranslation, rig, worlds);
  vec3.sub(outTranslation, outTranslation, ref.centre);
  vec3.add(outTranslation, outTranslation, rig.rootTranslation);
  bodyOrientation(outRotation, rig, worlds);
}

/**
 * A posed rig's body transform as a clip stores it (translation divided by the rig's scale):
 * the root a clip without root curves falls back to, taken from the character's default pose.
 */
export function rootFromWorld(rig: HumanoidRig, worlds: Float64Array): HumanoidRoot {
  const translation = vec3.create();
  const rotation = quat.create();
  bodyTransform(translation, rotation, rig, worlds);
  vec3.scale(translation, translation, 1 / rig.scale);
  return { translation, rotation };
}

const scratchBodyT = vec3.create();
const scratchBodyQ = quat.create();
const scratchBody = mat4.create();
const scratchTarget = mat4.create();
const scratchHips = mat4.create();
const scratchParentInverse = mat4.create();
const scratchT = vec3.create();
const scratchS = vec3.create();

/**
 * Move the hips so the pose's body transform equals `root` (the clip's RootT/RootQ; the
 * translation is in Unity's normalized units and is multiplied by the rig's scale). Requires
 * `worlds` composed from `pose`; both are updated in place.
 */
export function placeHips(
  rig: HumanoidRig,
  pose: HumanoidPose,
  worlds: Float64Array,
  root: HumanoidRoot,
): void {
  bodyTransform(scratchBodyT, scratchBodyQ, rig, worlds);
  mat4.fromRotationTranslation(scratchBody, scratchBodyQ, scratchBodyT);
  vec3.scale(scratchT, root.translation, rig.scale);
  mat4.fromRotationTranslation(scratchTarget, root.rotation, scratchT);
  // hips_new = target · body⁻¹ · hips
  const hips = rig.bones[0];
  mat4.invert(scratchBody, scratchBody);
  mat4.multiply(scratchHips, scratchTarget, scratchBody);
  mat4.multiply(scratchHips, scratchHips, worldOf(worlds, hips));
  const parent = rig.nodes[hips].parent;
  if (parent >= 0) {
    mat4.invert(scratchParentInverse, worldOf(worlds, parent));
    mat4.multiply(scratchLocal, scratchParentInverse, scratchHips);
  } else {
    mat4.copy(scratchLocal, scratchHips);
  }
  mat4.getTranslation(scratchT, scratchLocal);
  mat4.getRotation(scratchQ, scratchLocal);
  quat.normalize(scratchQ, scratchQ);
  mat4.getScaling(scratchS, scratchLocal);
  pose.translations.set(scratchT, hips * 3);
  pose.rotations.set(scratchQ, hips * 4);
  pose.scales.set(scratchS, hips * 3);
  composeRigWorld(rig, pose, worlds);
}

/**
 * One frame of a humanoid clip as local TRS of the rig's nodes: muscles applied, hips placed
 * by the root transform. `worlds` receives the composed world matrices (16 per node).
 */
export function solveHumanoidPose(
  rig: HumanoidRig,
  muscles: ArrayLike<number>,
  muscleOffset: number,
  root: HumanoidRoot,
  pose: HumanoidPose,
  worlds: Float64Array,
): HumanoidPose {
  setTPose(rig, pose);
  applyMuscles(rig, muscles, muscleOffset, pose);
  composeRigWorld(rig, pose, worlds);
  placeHips(rig, pose, worlds, root);
  return pose;
}

/**
 * Where a clip's IK goal sits for the posed rig, metres in root space: a hand goal is its
 * joint, a foot goal the sole — the ankle moved one foot length along the foot's axis, which
 * the Avatar points at the ground.
 */
export function goalPosition(
  out: vec3,
  rig: HumanoidRig,
  worlds: Float64Array,
  goal: HumanoidGoal,
): vec3 {
  const index = rig.bones[HUMAN_BONES.indexOf(goal)];
  nodePosition(out, worlds, index);
  if (goal === 'LeftFoot' || goal === 'RightFoot') {
    const axes = rig.nodes[index].axes!;
    axesRotation(scratchQ, rig, worlds, index);
    vec3.set(scratchAxis, axes.length, 0, 0);
    vec3.transformQuat(scratchAxis, scratchAxis, scratchQ);
    vec3.add(out, out, scratchAxis);
  }
  return out;
}

/** A goal's rotation is the end bone's muscle frame (bone rotation · postQ). */
export function goalRotation(
  out: quat,
  rig: HumanoidRig,
  worlds: Float64Array,
  goal: HumanoidGoal,
): quat {
  return axesRotation(out, rig, worlds, rig.bones[HUMAN_BONES.indexOf(goal)]);
}

/** A clip goal (normalized, root space) as a root-space position in metres. */
export function clipGoalToRootSpace(
  out: vec3,
  rig: HumanoidRig,
  root: HumanoidRoot,
  goalTranslation: vec3,
): vec3 {
  vec3.transformQuat(out, goalTranslation, root.rotation);
  vec3.add(out, out, root.translation);
  return vec3.scale(out, out, rig.scale);
}
