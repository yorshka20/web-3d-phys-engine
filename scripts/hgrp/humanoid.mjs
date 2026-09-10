/**
 * Humanoid clips in the converter: the export's `avatar.json` and `<clip>.humanoid.json`
 * (docs/hgrp-humanoid-animation.md §3) → per-frame world matrices of the human bones in the
 * clip FBX's frames, so clip-glb.mjs can bake them like any driven node while the FBX curves
 * keep driving the secondary bones.
 *
 * The solver itself is the engine's (packages/renderer/src/assets/humanoid/humanoid.ts) — one
 * implementation, imported here through Node's TypeScript type stripping. What this module
 * adds is export-specific: the sidecar's track naming and the frame change from Unity's space
 * to the export's FBX space.
 */

import { mat4, quat, vec3 } from 'gl-matrix';
import * as Humanoid from '../../packages/renderer/src/assets/humanoid/humanoid.ts';

export { Humanoid };

// HumanTrait.MuscleName order, 95 entries: the 55 body muscles then 40 finger muscles. The
// export names its tracks with this table.
const FINGER_MUSCLES = [];
for (const hand of ['LeftHand', 'RightHand']) {
  for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
    FINGER_MUSCLES.push(
      `${hand}.${finger}.1 Stretched`,
      `${hand}.${finger}.Spread`,
      `${hand}.${finger}.2 Stretched`,
      `${hand}.${finger}.3 Stretched`,
    );
  }
}
export const EXPORT_MUSCLE_NAMES = [...Humanoid.MUSCLES, ...FINGER_MUSCLES];

// What the export's muscle slots actually hold (measured on the 2026-09 export, verified by
// inverting the model's bind pose into muscle space and by the clips' own IK goals): the
// clip's tracks run body (21), left leg (8), LeftUpperLeg translation DoF (3), right leg (8),
// RightUpperLeg translation DoF (3), left arm (9), right arm (9). The exporter named slot i
// with EXPORT_MUSCLE_NAMES[i], which is right up to the left leg and then shifted — the right
// leg by three, both arms by six, the right arm landing under finger names. The clip data is
// complete; only the names are off, so the slots are read back by position. Remove this table
// once the exporter names tracks from the clip's own binding constant.
const EXPORT_SLOT_MEANING = [];
for (let dof = 0; dof <= 28; dof++) EXPORT_SLOT_MEANING.push({ dof });
for (let c = 0; c < 3; c++) EXPORT_SLOT_MEANING.push({ tdof: 'LeftUpperLeg', c });
for (let dof = 29; dof <= 36; dof++) EXPORT_SLOT_MEANING.push({ dof });
for (let c = 0; c < 3; c++) EXPORT_SLOT_MEANING.push({ tdof: 'RightUpperLeg', c });
for (let dof = 37; dof <= 54; dof++) EXPORT_SLOT_MEANING.push({ dof });

/**
 * A clip sidecar as dense per-frame arrays: `muscles` (55 per frame, MUSCLES order), `rootT`
 * (3), `rootQ` (4), `goals[name].t/q`, `tdof` (3 per frame per bone). Times run from
 * `start` at `sampleRate`.
 */
export function readHumanoidSidecar(json) {
  const frames = json.frameCount;
  if (!(frames > 0) || !(json.sampleRate > 0) || !json.curves) {
    throw new Error(`${json.name}: sidecar has no frames`);
  }
  const zeros = new Array(frames).fill(0);
  const curve = (key) => {
    const values = json.curves[key];
    if (values && values.length !== frames) {
      throw new Error(
        `${json.name}: curve ${key} has ${values.length} values for ${frames} frames`,
      );
    }
    return values ?? zeros;
  };
  const vector = (key, n) => {
    const components = n === 4 ? ['x', 'y', 'z', 'w'] : ['x', 'y', 'z'];
    const parts = components.map((c) => curve(`${key}.${c}`));
    const out = new Float64Array(frames * n);
    for (let f = 0; f < frames; f++) for (let i = 0; i < n; i++) out[f * n + i] = parts[i][f];
    return out;
  };
  const muscles = new Float64Array(frames * Humanoid.MUSCLE_COUNT);
  const tdof = {
    LeftUpperLeg: new Float64Array(frames * 3),
    RightUpperLeg: new Float64Array(frames * 3),
  };
  EXPORT_SLOT_MEANING.forEach((meaning, slot) => {
    const values = curve(EXPORT_MUSCLE_NAMES[slot]);
    for (let f = 0; f < frames; f++) {
      if (meaning.dof !== undefined) muscles[f * Humanoid.MUSCLE_COUNT + meaning.dof] = values[f];
      else tdof[meaning.tdof][f * 3 + meaning.c] = values[f];
    }
  });
  const goals = {};
  for (const goal of Humanoid.HUMANOID_GOALS) {
    goals[goal] = { t: vector(`${goal}T`, 3), q: vector(`${goal}Q`, 4) };
  }
  return {
    name: json.name,
    frames,
    sampleRate: json.sampleRate,
    start: json.startTime ?? 0,
    rootT: vector('RootT', 3),
    rootQ: vector('RootQ', 4),
    goals,
    muscles,
    tdof,
    settings: json.settings ?? {},
  };
}

/** The clip's root transform at a frame, as the solver takes it. */
export function sidecarRoot(sidecar, frame) {
  return {
    translation: sidecar.rootT.subarray(frame * 3, frame * 3 + 3),
    rotation: quat.normalize(quat.create(), sidecar.rootQ.subarray(frame * 4, frame * 4 + 4)),
  };
}

// The export's FBX world is Unity's mirrored in x: positions negate x, rotations are
// conjugated by the mirror. A proper rotation stays proper under conjugation, which is why
// the FBX still reads as a plain hierarchy.
const MIRROR_X = mat4.fromScaling(mat4.create(), [-1, 1, 1]);
function mirrored(out, world) {
  mat4.multiply(out, MIRROR_X, world);
  return mat4.multiply(out, out, MIRROR_X);
}

/**
 * Drive the Avatar's nodes of a clip FBX from a humanoid sidecar. `clipNodesByPath` maps node
 * paths below the animator root to the FBX hierarchy nodes (fbx-anim.mjs); `tPoseByPath` is
 * the character FBX's node-default world matrix per path — the prefab's T-pose, the one pose
 * known in both the FBX's and the Avatar's frames (a clip FBX's own defaults are the A-pose
 * the meshes were bound in, so they cannot serve).
 *
 * Beyond the mirror, each FBX node frame differs from the Unity node frame of the same bone
 * by a fixed rotation (the exporter re-expresses some bones, the spine chain and legs by a
 * half turn). That per-node change is read off the T-pose and applied to every solved frame:
 * W_fbx(n) = M · W_unity(n) · G(n) · M with G(n) = U_T(n)⁻¹ · M · W_fbxT(n) · M.
 */
export function createHumanoidDriver(rig, sidecar, clipNodesByPath, tPoseByPath) {
  const nodeIds = [];
  const frameChange = [];
  const tPose = Humanoid.composeRigWorld(
    rig,
    Humanoid.setTPose(rig, Humanoid.createHumanoidPose(rig)),
    new Float64Array(rig.nodes.length * 16),
  );
  const mirroredRest = mat4.create();
  const unityRest = mat4.create();
  let maxOffset = 0;
  rig.nodes.forEach((node, i) => {
    const clipNode = clipNodesByPath.get(node.path);
    if (!clipNode) throw new Error(`the clip has no node ${node.path} for the Avatar`);
    nodeIds.push(clipNode.id);
    const rest = tPoseByPath.get(node.path);
    if (!rest) throw new Error(`the character FBX has no node ${node.path} for the Avatar`);
    mirrored(mirroredRest, rest);
    mat4.copy(unityRest, tPose.subarray(i * 16, i * 16 + 16));
    // Both are the T-pose: the mirrored FBX position must equal the Avatar's
    maxOffset = Math.max(
      maxOffset,
      vec3.distance(
        mat4.getTranslation(vec3.create(), mirroredRest),
        mat4.getTranslation(vec3.create(), unityRest),
      ),
    );
    const change = mat4.invert(mat4.create(), unityRest);
    frameChange.push(mat4.multiply(change, change, mirroredRest));
  });
  if (maxOffset > 1e-3) {
    throw new Error(
      `the character FBX's default pose is not the Avatar's T-pose (${(maxOffset * 1000).toFixed(1)} mm apart)`,
    );
  }
  const pose = Humanoid.createHumanoidPose(rig);
  const worlds = new Float64Array(rig.nodes.length * 16);
  const scratch = mat4.create();
  return {
    frames: sidecar.frames,
    fps: sidecar.sampleRate,
    start: sidecar.start,
    nodeIds: new Set(nodeIds),
    /** id -> world matrix (FBX frames) of every Avatar node at `frame`. */
    worldsAt(frame) {
      Humanoid.solveHumanoidPose(
        rig,
        sidecar.muscles,
        frame * Humanoid.MUSCLE_COUNT,
        sidecarRoot(sidecar, frame),
        pose,
        worlds,
      );
      const out = new Map();
      for (let i = 0; i < nodeIds.length; i++) {
        mat4.multiply(scratch, worlds.subarray(i * 16, i * 16 + 16), frameChange[i]);
        out.set(nodeIds[i], mirrored(mat4.create(), scratch));
      }
      return out;
    },
  };
}

// Eigenvector of the largest eigenvalue of a symmetric 4×4 matrix, by cyclic Jacobi rotations
function dominantEigenvector4(A) {
  const a = A.map((row) => [...row]);
  const V = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const sn = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - sn * akq;
          a[k][q] = sn * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - sn * aqk;
          a[q][k] = sn * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - sn * vkq;
          V[k][q] = sn * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [V[0][best], V[1][best], V[2][best], V[3][best]];
}

/** Rigid transform (rotation R, translation t) with target ≈ R·source + t, Horn's quaternion method. */
export function rigidFit(source, target) {
  const n = source.length;
  const cs = [0, 0, 0];
  const ct = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      cs[k] += source[i][k] / n;
      ct[k] += target[i][k] / n;
    }
  }
  const S = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) S[a][b] += (source[i][a] - cs[a]) * (target[i][b] - ct[b]);
    }
  }
  const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = S;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const v = dominantEigenvector4(N);
  const R = quat.normalize(quat.create(), quat.fromValues(v[1], v[2], v[3], v[0]));
  const t = vec3.subtract(vec3.create(), ct, vec3.transformQuat(vec3.create(), cs, R));
  return { R, t };
}

/**
 * How far the solved hands and feet are from the clip's own IK goals, per frame: `absolute`
 * with the hips placed by the body transform, `fitted` after the best rigid transform (what is
 * left is the muscle solve alone). Goals the source baked on another rig sit centimetres off
 * every frame; a clip authored on this rig reads ~0.1 mm fitted.
 */
export function goalResiduals(rig, sidecar) {
  const pose = Humanoid.createHumanoidPose(rig);
  const worlds = new Float64Array(rig.nodes.length * 16);
  const absolute = new Float64Array(sidecar.frames);
  const fitted = new Float64Array(sidecar.frames);
  for (let f = 0; f < sidecar.frames; f++) {
    const root = sidecarRoot(sidecar, f);
    Humanoid.solveHumanoidPose(rig, sidecar.muscles, f * Humanoid.MUSCLE_COUNT, root, pose, worlds);
    const solved = Humanoid.HUMANOID_GOALS.map((g) =>
      Humanoid.goalPosition(vec3.create(), rig, worlds, g),
    );
    const stored = Humanoid.HUMANOID_GOALS.map((g) =>
      Humanoid.clipGoalToRootSpace(
        vec3.create(),
        rig,
        root,
        sidecar.goals[g].t.subarray(f * 3, f * 3 + 3),
      ),
    );
    absolute[f] = Math.max(...solved.map((p, i) => vec3.distance(p, stored[i])));
    const { R, t } = rigidFit(solved, stored);
    fitted[f] = Math.max(
      ...solved.map((p, i) =>
        vec3.distance(
          vec3.add(vec3.create(), vec3.transformQuat(vec3.create(), p, R), t),
          stored[i],
        ),
      ),
    );
  }
  return { absolute, fitted };
}
