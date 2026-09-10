/**
 * Check humanoid clips against their own IK goals (docs/hgrp-humanoid-animation.md §2):
 *
 *   node scripts/hgrp/humanoid-check.mjs <humanoid-root>/<actor> <actor.fbx> <model.glb> [clipName ...]
 *
 * For every `clips/<clip>.humanoid.json` (or the named ones) the body is solved against the
 * folder's avatar.json and the solved hands and feet compared with the goals the clip stores,
 * per frame: `fitted` is the distance left after the best rigid transform — the muscle solve
 * alone, 0.1 mm on a clip authored for this rig — and `absolute` includes the hips placement
 * by the body transform. A clip whose goals were baked on another rig (the additive loops,
 * the shared sets) sits centimetres off on every frame; a jump where the source's IK goals
 * leave the pose shows a spike over a few frames. Neither is a solver fault, and neither
 * changes how the clip is baked: the muscles are the pose, the goals are for IK.
 *
 * The character FBX and glb supply the default pose a clip's missing curves fall back to
 * (readBindPose). Exit code 1 when a clip cannot be solved: a stale sidecar without
 * `curveIndex`, a curve at an unexpected index, an Avatar node the FBX lacks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readBindPose } from './clip-glb.mjs';
import { goalResiduals, Humanoid, humanoidRigCheck, readHumanoidSidecar } from './humanoid.mjs';

const [actorDir, modelFbx, modelGlb, ...only] = process.argv.slice(2);
if (!actorDir || !modelFbx || !modelGlb) {
  console.error(
    'Usage: node scripts/hgrp/humanoid-check.mjs <humanoid-root>/<actor> <actor.fbx> <model.glb> [clipName ...]',
  );
  process.exit(1);
}
const avatarPath = path.join(actorDir, 'avatar.json');
if (!fs.existsSync(avatarPath)) {
  console.error(`${actorDir}: no avatar.json`);
  process.exit(1);
}
const rig = Humanoid.parseAvatar(JSON.parse(fs.readFileSync(avatarPath, 'utf8')));
const bindPose = await readBindPose(modelFbx, modelGlb);
const frames = humanoidRigCheck(rig, bindPose.restByPath, bindPose.byPath);
console.log(
  `${rig.name}: ${rig.nodes.length} nodes, scale ${rig.scale.toFixed(4)}, ` +
    `${[...rig.bones].filter((i) => i >= 0).length}/${Humanoid.HUMAN_BONE_COUNT} human bones; ` +
    `default pose root at ${[...frames.defaults.root.translation].map((x) => (x * rig.scale).toFixed(3)).join(', ')} m`,
);

const clipDir = path.join(actorDir, 'clips');
const files = fs
  .readdirSync(clipDir)
  .filter((f) => f.endsWith('.humanoid.json'))
  .filter((f) => only.length === 0 || only.includes(f.replace(/\.humanoid\.json$/, '')))
  .sort();
let failed = false;
const mm = (v) => (v * 1000).toFixed(1).padStart(6);
console.log('clip'.padEnd(44) + ' frames  fitted max  absolute max  frames > 2 mm (fitted)');
for (const file of files) {
  try {
    const sidecar = readHumanoidSidecar(
      JSON.parse(fs.readFileSync(path.join(clipDir, file), 'utf8')),
    );
    const { absolute, fitted, goals } = goalResiduals(rig, sidecar, frames.defaults);
    const worstFitted = Math.max(0, ...fitted);
    const worstAbsolute = Math.max(0, ...absolute);
    const off = fitted.filter((d) => d > 0.002).length;
    const absent = sidecar.musclePresent.filter((p) => !p).length;
    const notes = [];
    if (off > 0) notes.push('goals not on this rig / IK');
    if (absent > 0)
      notes.push(`${absent} muscles + ${sidecar.rootPresent ? 0 : 1} root from the default pose`);
    if (goals.length < Humanoid.HUMANOID_GOALS.length) notes.push(`${goals.length} goals keyed`);
    console.log(
      `${sidecar.name.padEnd(44)} ${String(sidecar.frames).padStart(6)}  ${mm(worstFitted)} mm  ` +
        `${mm(worstAbsolute)} mm     ${off}/${sidecar.frames}${notes.length ? `  (${notes.join('; ')})` : ''}`,
    );
  } catch (error) {
    failed = true;
    console.error(`${file}: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failed ? 1 : 0);
