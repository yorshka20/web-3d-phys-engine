/**
 * Humanoid clips in the converter: the export's `avatar.json` and `<clip>.humanoid.json`
 * (docs/hgrp-humanoid-animation.md §3). The body is not baked: clip-glb.mjs ships the muscle
 * curves in the clip glb and the engine solves them against the character it plays on; what
 * the converter contributes is the character's binding of its Avatar to the glb
 * (avatarBinding → avatar.binding.json), and the checks that the export's FBX is the Avatar's
 * skeleton mirrored in x.
 *
 * The solver itself is the engine's (packages/renderer/src/assets/humanoid/humanoid.ts) — one
 * implementation, imported here through Node's TypeScript type stripping — and is run here
 * only to validate the clips against their own IK goals (goalResiduals, humanoid-check.mjs).
 */

import fs from 'node:fs';
import path from 'node:path';
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

// Animator float parameters ride in the sidecar's `otherCurves` under CRC32(name); these four
// are the ones the roster's 68 hashes could be named (Unity's Animator.StringToHash is CRC32).
const PARAMETER_NAMES = new Map([
  [2765131272, 'WeaponHide'],
  [345227111, 'RootMotionWeight'],
  [729379380, 'FootIKWeight'],
  [1624416957, 'ClothRightLeft'],
]);

/** The character folder a manifest's animator was baked on: `chr_0023_antal_uimodel` -> `antal`. */
export function actorOfAnimator(animator) {
  return /^chr_\d+_(.+?)_(?:uimodel|postmodel)$/.exec(animator ?? '')?.[1];
}

/**
 * The avatar.json the humanoid clips of a folder are solved against: the folder's own for a
 * character, and for a shared set (`_common/<bodyType>`, which ships none) the Avatar of the
 * actor its manifest names as the animator, `<humanoid-root>/<actor>/avatar.json`.
 */
export function humanoidAvatarPath(folder) {
  const own = path.join(folder, 'avatar.json');
  if (fs.existsSync(own)) return own;
  const manifestPath = path.join(folder, 'clips', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return undefined;
  const actor = actorOfAnimator(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).animator);
  return actor ? path.join(folder, '..', '..', actor, 'avatar.json') : undefined;
}

/**
 * A clip sidecar as dense per-frame arrays: `muscles` (55 per frame, MUSCLES order),
 * `rootT` (3), `rootQ` (4), `goals[name].t/q`, with `musclePresent`, `rootPresent` and
 * `goalPresent` saying which of them the clip actually keys — the others read 0 here and take
 * the character's default pose where the clip is solved. `parameters` are the Animator float
 * curves (`hash`, `name` when known, `values`). Times run from `start` at `sampleRate`.
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
  const parameters = (json.otherCurves ?? [])
    .filter((curve) => curve.typeID === 'Animator' && Array.isArray(curve.values))
    .map((curve) => {
      if (curve.values.length !== frames) {
        throw new Error(
          `${json.name}: parameter ${curve.attribute} has ${curve.values.length} values for ${frames} frames`,
        );
      }
      return {
        hash: curve.attribute,
        name: PARAMETER_NAMES.get(curve.attribute),
        values: Float32Array.from(curve.values),
      };
    });
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
    parameters,
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
 * Relate a character FBX to the Avatar and read what the bake needs from it: `tPoseByPath` is
 * the FBX's node-default world matrix per path (the prefab's T-pose), `bindByPath` the skin
 * clusters' bind world matrices (readBindPose).
 *
 * The FBX must be the Avatar's skeleton mirrored in x: every node's rotation has to match the
 * Avatar's T-pose once mirrored, or the solved rotations would land in the wrong frames. The
 * translations need not: Unity's Animator writes the human bones' rotations and the hips'
 * transform onto the prefab's hierarchy and leaves every other local transform as the prefab
 * has it, so `locals` returns the prefab's local TRS per Avatar node (Unity space) for the
 * driver to compose the solved rotations with. Where the prefab's offsets differ from the
 * Avatar's T-pose — the hips by up to 3 cm, the pelvis by up to 3 mm on half the roster — the
 * difference is reported as `offsets`, not applied.
 *
 * `defaults` is the character's default pose in muscle space, from the bind pose: what Unity's
 * Animator starts from and the value a curve the clip does not key keeps.
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
  const t = vec3.create();
  const offsets = [];
  const locals = rig.nodes.map(() => ({
    translation: vec3.create(),
    rotation: quat.create(),
    scale: vec3.create(),
  }));
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
    } else {
      mat4.copy(local, rest);
    }
    mat4.getTranslation(locals[i].translation, local);
    quat.normalize(locals[i].rotation, mat4.getRotation(locals[i].rotation, local));
    mat4.getScaling(locals[i].scale, local);
    if (node.parent >= 0) {
      mat4.getTranslation(t, local);
      const offset = vec3.distance(t, node.translation);
      if (offset > 1e-4) offsets.push({ path: node.path, offset });
    }
    mirrored(bindWorlds.subarray(i * 16, i * 16 + 16), fbxBind);
  });
  return {
    offsets,
    locals,
    defaults: {
      muscles: Humanoid.musclesFromWorld(new Float64Array(Humanoid.MUSCLE_COUNT), rig, bindWorlds),
      root: Humanoid.rootFromWorld(rig, bindWorlds),
    },
  };
}

/** The `offsets` of humanoidRigCheck as one line for a log, empty when there are none. */
export function describeOffsets(offsets) {
  if (offsets.length === 0) return '';
  return offsets
    .map(({ path, offset }) => `${path.split('/').pop()} ${(offset * 1000).toFixed(1)} mm`)
    .join(', ');
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
 * The character's `avatar.binding.json`: what the engine needs to write a pose solved on the
 * Avatar's skeleton into this glb (renderer/assets/humanoid/binding.ts). Per Avatar node, the
 * fixed change from the bone's FBX frame to the glb's bone frame — `bind⁻¹ · rest`, the same
 * offset the generic bake applies to every driven joint — and the prefab's local transform in
 * Unity space (humanoidRigCheck's `locals`: what the engine writes for the translations, and
 * for the rotation of a node no muscle drives); plus the character's default pose in muscle
 * space for the curves a clip lacks. `bindPose` is readBindPose() of the character.
 */
export function avatarBinding(rig, check, bindPose) {
  const frame = mat4.create();
  const inverseBind = mat4.create();
  const scale = vec3.create();
  const rotation = quat.create();
  const translation = vec3.create();
  const nodes = rig.nodes.map((node, i) => {
    const bind = bindPose.byPath.get(node.path);
    const rest = bindPose.glbRestByPath.get(node.path);
    if (!bind || !rest) throw new Error(`the model has no node ${node.path} for the Avatar`);
    mat4.multiply(frame, mat4.invert(inverseBind, bind), rest);
    mat4.getScaling(scale, frame);
    if (
      Math.abs(scale[0] - 1) > 1e-3 ||
      Math.abs(scale[1] - 1) > 1e-3 ||
      Math.abs(scale[2] - 1) > 1e-3
    ) {
      throw new Error(
        `${node.path}: the glb's bone frame is scaled against the FBX's (${scale.join(', ')})`,
      );
    }
    quat.normalize(rotation, mat4.getRotation(rotation, frame));
    mat4.getTranslation(translation, frame);
    return {
      path: node.path,
      frame: { rotation: [...rotation], translation: [...translation] },
      local: {
        rotation: [...check.locals[i].rotation],
        translation: [...check.locals[i].translation],
      },
    };
  });
  return {
    avatar: rig.name,
    nodes,
    defaults: {
      muscles: [...check.defaults.muscles],
      root: {
        translation: [...check.defaults.root.translation],
        rotation: [...check.defaults.root.rotation],
      },
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
 * are left out; `defaults` (humanoidRigCheck's) fills the curves it does not key.
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
