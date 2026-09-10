/**
 * Humanoid clips in the converter: the export's `avatar.json` and `<clip>.humanoid.json`
 * (docs/hgrp-humanoid-animation.md §3) → per-frame world matrices of the human bones in the
 * clip FBX's frames, so clip-glb.mjs can bake them like any driven node while the FBX curves
 * keep driving the secondary bones.
 *
 * The solver itself is the engine's (packages/renderer/src/assets/humanoid/humanoid.ts) — one
 * implementation, imported here through Node's TypeScript type stripping. What this module
 * adds is export-specific: reading the sidecar, the character's default pose for the curves a
 * clip leaves out, and the mirror from Unity's space into the export's FBX space.
 */

import { mat4, quat, vec3 } from 'gl-matrix';
import * as Humanoid from '../../packages/renderer/src/assets/humanoid/humanoid.ts';

export { Humanoid };

// The sidecar's humanoid curve index space (the export README tabulates it): what index each
// curve the solver reads must carry. Asserting it catches a mislabelled export — the batch
// before 2026-09-10 numbered the muscles straight through and misnamed everything after the
// left leg — rather than trusting the names.
const GOAL_SLOTS = { LeftFoot: 14, RightFoot: 21, LeftHand: 28, RightHand: 35 };
const EXPECTED_INDEX = new Map();
for (const [i, c] of ['x', 'y', 'z'].entries()) EXPECTED_INDEX.set(`RootT.${c}`, 7 + i);
for (const [i, c] of ['x', 'y', 'z', 'w'].entries()) EXPECTED_INDEX.set(`RootQ.${c}`, 10 + i);
for (const [goal, base] of Object.entries(GOAL_SLOTS)) {
  for (const [i, c] of ['x', 'y', 'z'].entries()) EXPECTED_INDEX.set(`${goal}T.${c}`, base + i);
  for (const [i, c] of ['x', 'y', 'z', 'w'].entries())
    EXPECTED_INDEX.set(`${goal}Q.${c}`, base + 3 + i);
}
{
  // body 21, left leg 8, a translation-DoF triple, right leg 8, another triple, left arm 9, right arm 9
  let slot = 42;
  for (let m = 0; m < Humanoid.MUSCLE_COUNT; m++) {
    if (m === 29 || m === 37) slot += 3;
    EXPECTED_INDEX.set(Humanoid.MUSCLES[m], slot++);
  }
}

/**
 * A clip sidecar as dense per-frame arrays: `muscles` (55 per frame, MUSCLES order),
 * `rootT` (3), `rootQ` (4), `goals[name].t/q`, with `musclePresent`, `rootPresent` and
 * `goalPresent` saying which of them the clip actually keys — the others read 0 here and take
 * the character's default pose in the driver. Times run from `start` at `sampleRate`.
 */
export function readHumanoidSidecar(json) {
  const frames = json.frameCount;
  if (!(frames > 0) || !(json.sampleRate > 0) || !json.curves) {
    throw new Error(`${json.name}: sidecar has no frames`);
  }
  if (!json.curveIndex) {
    throw new Error(
      `${json.name}: sidecar predates the export's curve-naming fix (no curveIndex) — re-export it`,
    );
  }
  for (const [name, index] of EXPECTED_INDEX) {
    const actual = json.curveIndex[name];
    if (actual !== undefined && actual !== index) {
      throw new Error(`${json.name}: curve ${name} is at index ${actual}, expected ${index}`);
    }
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
  const present = (key) => json.curves[key] !== undefined;
  const muscles = new Float64Array(frames * Humanoid.MUSCLE_COUNT);
  const musclePresent = new Uint8Array(Humanoid.MUSCLE_COUNT);
  Humanoid.MUSCLES.forEach((name, m) => {
    if (!present(name)) return;
    musclePresent[m] = 1;
    const values = json.curves[name];
    for (let f = 0; f < frames; f++) muscles[f * Humanoid.MUSCLE_COUNT + m] = values[f];
  });
  const goals = {};
  const goalPresent = {};
  for (const goal of Humanoid.HUMANOID_GOALS) {
    goals[goal] = { t: vector(`${goal}T`, 3), q: vector(`${goal}Q`, 4) };
    goalPresent[goal] = present(`${goal}T.x`) && present(`${goal}Q.w`);
  }
  return {
    name: json.name,
    frames,
    sampleRate: json.sampleRate,
    start: json.startTime ?? 0,
    rootT: vector('RootT', 3),
    rootQ: vector('RootQ', 4),
    rootPresent: present('RootT.x') && present('RootQ.w'),
    goals,
    goalPresent,
    muscles,
    musclePresent,
    settings: json.settings ?? {},
  };
}

// The export's FBX world is Unity's mirrored in x: positions negate x, rotations are
// conjugated by the mirror (a proper rotation stays proper, which is why the FBX still reads
// as a plain hierarchy). Nothing else differs per node — the FBX node frames are exactly the
// mirrored Unity frames — so this one conjugation carries a solved pose into the FBX.
const MIRROR_X = mat4.fromScaling(mat4.create(), [-1, 1, 1]);
function mirrored(out, world) {
  mat4.multiply(out, MIRROR_X, world);
  return mat4.multiply(out, out, MIRROR_X);
}

/**
 * Check that a character FBX is the Avatar's skeleton mirrored, and read the character's
 * default pose in muscle space. `tPoseByPath` is the FBX's node-default world matrix per path
 * (the prefab's T-pose), `bindByPath` the skin clusters' bind world matrices (readBindPose) —
 * the pose Unity's Animator starts from and the value a curve the clip does not key keeps.
 *
 * Every node's rotation must match the Avatar's T-pose once mirrored, and every bone's local
 * offset from its parent too; the hips may sit millimetres from the prefab's (the Avatar's
 * skeleton pose is Unity's, the prefab's is the model's) — the solver places them from the
 * clip's root anyway, so that offset is reported, not applied.
 */
export function humanoidRigCheck(rig, tPoseByPath, bindByPath) {
  const n = rig.nodes.length;
  const tPose = Humanoid.composeRigWorld(
    rig,
    Humanoid.setTPose(rig, Humanoid.createHumanoidPose(rig)),
    new Float64Array(n * 16),
  );
  const bindWorlds = new Float64Array(n * 16);
  const rest = mat4.create();
  const parentRest = mat4.create();
  const local = mat4.create();
  const q = quat.create();
  const avatarQ = quat.create();
  const avatarT = vec3.create();
  const t = vec3.create();
  let hipsOffset = 0;
  rig.nodes.forEach((node, i) => {
    const fbxRest = tPoseByPath.get(node.path);
    const fbxBind = bindByPath.get(node.path);
    if (!fbxRest || !fbxBind)
      throw new Error(`the character FBX has no node ${node.path} for the Avatar`);
    mirrored(rest, fbxRest);
    mat4.getRotation(q, rest);
    mat4.getRotation(avatarQ, tPose.subarray(i * 16, i * 16 + 16));
    const angle =
      (2 *
        Math.acos(
          Math.min(1, Math.abs(quat.dot(quat.normalize(q, q), quat.normalize(avatarQ, avatarQ)))),
        ) *
        180) /
      Math.PI;
    if (angle > 0.05) {
      throw new Error(
        `${node.path}: the FBX node frame is ${angle.toFixed(2)}° from the Avatar's (mirrored) — the FBX is not the Avatar's skeleton mirrored in x`,
      );
    }
    if (node.parent >= 0) {
      mirrored(parentRest, tPoseByPath.get(rig.nodes[node.parent].path));
      mat4.multiply(local, mat4.invert(local, parentRest), rest);
      mat4.getTranslation(t, local);
      const offset = vec3.distance(t, node.translation);
      if (i === rig.bones[0]) hipsOffset = offset;
      else if (offset > 1e-3) {
        throw new Error(
          `${node.path}: the FBX rest offset from its parent is ${(offset * 1000).toFixed(1)} mm from the Avatar's T-pose`,
        );
      }
    }
    mirrored(bindWorlds.subarray(i * 16, i * 16 + 16), fbxBind);
  });
  return {
    hipsOffset,
    defaults: {
      muscles: Humanoid.musclesFromWorld(new Float64Array(Humanoid.MUSCLE_COUNT), rig, bindWorlds),
      root: Humanoid.rootFromWorld(rig, bindWorlds),
    },
  };
}

/** One frame's solver inputs, absent curves filled from the character's default pose. */
export function frameInputs(sidecar, defaults, frame, musclesOut) {
  const base = frame * Humanoid.MUSCLE_COUNT;
  for (let m = 0; m < Humanoid.MUSCLE_COUNT; m++) {
    musclesOut[m] = sidecar.musclePresent[m] ? sidecar.muscles[base + m] : defaults.muscles[m];
  }
  const root = sidecar.rootPresent
    ? {
        translation: sidecar.rootT.subarray(frame * 3, frame * 3 + 3),
        rotation: quat.normalize(quat.create(), sidecar.rootQ.subarray(frame * 4, frame * 4 + 4)),
      }
    : defaults.root;
  return { muscles: musclesOut, root };
}

/**
 * Drive the Avatar's nodes of a clip FBX from a humanoid sidecar. `clipNodesByPath` maps node
 * paths below the animator root to the FBX hierarchy nodes (fbx-anim.mjs); `defaults` is the
 * character's default pose (humanoidRigCheck).
 */
export function createHumanoidDriver(rig, sidecar, clipNodesByPath, defaults) {
  const nodeIds = rig.nodes.map((node) => {
    const clipNode = clipNodesByPath.get(node.path);
    if (!clipNode) throw new Error(`the clip has no node ${node.path} for the Avatar`);
    return clipNode.id;
  });
  const pose = Humanoid.createHumanoidPose(rig);
  const worlds = new Float64Array(rig.nodes.length * 16);
  const muscles = new Float64Array(Humanoid.MUSCLE_COUNT);
  return {
    frames: sidecar.frames,
    fps: sidecar.sampleRate,
    start: sidecar.start,
    nodeIds: new Set(nodeIds),
    /** id -> world matrix (FBX frames) of every Avatar node at `frame`. */
    worldsAt(frame) {
      const input = frameInputs(sidecar, defaults, frame, muscles);
      Humanoid.solveHumanoidPose(rig, input.muscles, 0, input.root, pose, worlds);
      const out = new Map();
      for (let i = 0; i < nodeIds.length; i++) {
        out.set(nodeIds[i], mirrored(mat4.create(), worlds.subarray(i * 16, i * 16 + 16)));
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
 * every frame; a clip authored on this rig reads ~0.1 mm fitted. Goals the clip does not key
 * are left out; `defaults` (humanoidRigCheck) fills the curves it does not key.
 */
export function goalResiduals(rig, sidecar, defaults) {
  const pose = Humanoid.createHumanoidPose(rig);
  const worlds = new Float64Array(rig.nodes.length * 16);
  const muscles = new Float64Array(Humanoid.MUSCLE_COUNT);
  const goals = Humanoid.HUMANOID_GOALS.filter((g) => sidecar.goalPresent[g]);
  const absolute = new Float64Array(sidecar.frames);
  const fitted = new Float64Array(sidecar.frames);
  for (let f = 0; f < sidecar.frames; f++) {
    const input = frameInputs(sidecar, defaults, f, muscles);
    Humanoid.solveHumanoidPose(rig, input.muscles, 0, input.root, pose, worlds);
    if (goals.length === 0) continue;
    const solved = goals.map((g) => Humanoid.goalPosition(vec3.create(), rig, worlds, g));
    const stored = goals.map((g) =>
      Humanoid.clipGoalToRootSpace(
        vec3.create(),
        rig,
        input.root,
        sidecar.goals[g].t.subarray(f * 3, f * 3 + 3),
      ),
    );
    absolute[f] = Math.max(...solved.map((p, i) => vec3.distance(p, stored[i])));
    if (goals.length < 3) {
      fitted[f] = absolute[f];
      continue;
    }
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
  return { absolute, fitted, goals };
}
