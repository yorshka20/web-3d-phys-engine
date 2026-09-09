/**
 * Validate clip files against a character model the way the engine joins them
 * (docs/hgrp-clip-format.md §5):
 *
 *   node scripts/hgrp/clip-check.mjs <model.glb> <clip.glb> [<clip.glb> ...]
 *
 * Exit code 1 when any clip fails. The path rule mirrors renderer/assets/gltfAnimations.ts:
 * a clip node is matched to a model node by its name path below the scene root.
 */

import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';

const [modelPath, ...clipPaths] = process.argv.slice(2);
if (!modelPath || clipPaths.length === 0) {
  console.error('Usage: node scripts/hgrp/clip-check.mjs <model.glb> <clip.glb> [...]');
  process.exit(1);
}

const io = new NodeIO();

function pathsBelowRoot(root) {
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const byNode = new Map();
  const byPath = new Map();
  const parents = new Map();
  const visit = (node, prefix) => {
    for (const child of node.listChildren()) {
      const path = prefix ? `${prefix}/${child.getName()}` : child.getName();
      byNode.set(child, path);
      byPath.set(path, child);
      parents.set(child, node);
      visit(child, path);
    }
  };
  for (const node of scene?.listChildren() ?? []) {
    parents.set(node, undefined);
    visit(node, '');
  }
  return { byNode, byPath, parents, sceneRoots: scene?.listChildren() ?? [] };
}

// --- minimal TRS evaluation of the clip at a time, in the model's hierarchy -----------------
function sample(track, time) {
  const { t, v, stride } = track;
  if (time <= t[0]) return Array.from(v.subarray(0, stride));
  const last = t.length - 1;
  if (time >= t[last]) return Array.from(v.subarray(last * stride, (last + 1) * stride));
  let i = 0;
  while (t[i + 1] < time) i++;
  const a = (time - t[i]) / (t[i + 1] - t[i]);
  const out = [];
  for (let k = 0; k < stride; k++)
    out.push(v[i * stride + k] * (1 - a) + v[(i + 1) * stride + k] * a);
  if (stride === 4) {
    const l = Math.hypot(...out) || 1;
    return out.map((x) => x / l);
  }
  return out;
}
function trs(t, q, s) {
  const [x, y, z, w] = q;
  const m = [
    1 - 2 * (y * y + z * z),
    2 * (x * y + w * z),
    2 * (x * z - w * y),
    0,
    2 * (x * y - w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z + w * x),
    0,
    2 * (x * z + w * y),
    2 * (y * z - w * x),
    1 - 2 * (x * x + y * y),
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  return m;
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

const model = (await io.read(modelPath)).getRoot();
const modelPaths = pathsBelowRoot(model);
let failed = false;

for (const clipPath of clipPaths) {
  const problems = [];
  const root = (await io.read(clipPath)).getRoot();
  const meshes = root.listMeshes().length;
  const skins = root.listSkins().length;
  const animations = root.listAnimations();
  if (meshes > 0 || skins > 0)
    problems.push(
      `carries ${meshes} meshes / ${skins} skins — a clip file holds nodes and one animation only`,
    );
  if (animations.length === 0) problems.push('holds no animation');
  const clipPaths_ = pathsBelowRoot(root);

  for (const animation of animations) {
    const tracks = new Map(); // model path -> { translation?, rotation?, scale? }
    let matched = 0;
    const dropped = [];
    let duration = 0;
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      const sampler = channel.getSampler();
      const path = node ? clipPaths_.byNode.get(node) : undefined;
      if (!path || !modelPaths.byPath.has(path) || !sampler) {
        dropped.push(path ?? '(no target)');
        continue;
      }
      matched++;
      const input = sampler.getInput().getArray();
      duration = Math.max(duration, input[input.length - 1]);
      const entry = tracks.get(path) ?? {};
      entry[channel.getTargetPath()] = {
        t: input,
        v: sampler.getOutput().getArray(),
        stride: channel.getTargetPath() === 'rotation' ? 4 : 3,
      };
      tracks.set(path, entry);
    }

    // Evaluate the model's pose at t = 0 with the clip applied; anything undriven keeps the rest
    // transform the CLIP file stores (that is what the engine does too, via the clip's nodes
    // only for its own document — here the model's rest is used, which is the same by contract).
    const worldAt = (node, time) => {
      let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const chain = [];
      for (let c = node; c; c = modelPaths.parents.get(c)) chain.unshift(c);
      for (const n of chain) {
        const track = tracks.get(modelPaths.byNode.get(n)) ?? {};
        const t = track.translation ? sample(track.translation, time) : n.getTranslation();
        const q = track.rotation ? sample(track.rotation, time) : n.getRotation();
        const s = track.scale ? sample(track.scale, time) : n.getScale();
        m = mul(m, trs(t, q, s));
      }
      return [m[12], m[13], m[14]];
    };
    const find = (name) => model.listNodes().find((n) => n.getName() === name);
    const pelvis = find('Bip001');
    const head = find('Bip001_Head');
    const poseLines = [];
    if (pelvis) {
      const p = worldAt(pelvis, 0);
      poseLines.push(`Bip001 at t=0: (${p.map((v) => v.toFixed(3)).join(', ')}) m`);
      if (!(p[1] > 0.6 && p[1] < 1.3))
        problems.push(
          `pelvis height ${p[1].toFixed(3)} m at t=0 is not a standing character — check the axis convention (docs/hgrp-clip-format.md §4)`,
        );
      if (Math.abs(p[0]) > 1.5 || Math.abs(p[2]) > 1.5)
        problems.push(
          `pelvis is ${Math.hypot(p[0], p[2]).toFixed(2)} m off the origin at t=0 — root motion or a stray placement`,
        );
      if (head) {
        const h = worldAt(head, 0);
        poseLines.push(`Bip001_Head at t=0: (${h.map((v) => v.toFixed(3)).join(', ')}) m`);
        if (h[1] <= p[1])
          problems.push('head is not above the pelvis at t=0 — the up axis is wrong');
      }
    }
    const droppedSummary = dropped.length ? ` (first: ${dropped.slice(0, 3).join(', ')})` : '';
    console.log(
      `${clipPath}\n  ${root.listNodes().length} nodes, ${meshes} meshes, ${animations.length} animation, ` +
        `"${animation.getName()}" ${duration.toFixed(2)} s, ${animation.listChannels().length} channels, ` +
        `${matched} matched, ${dropped.length} dropped${droppedSummary}\n  ${poseLines.join('; ')}`,
    );
    if (matched === 0)
      problems.push('no channel matched a model node — the node names or hierarchy do not match');
    else if (dropped.length > matched)
      problems.push(
        `${dropped.length} of ${dropped.length + matched} channels target nodes the model lacks`,
      );
  }

  if (problems.length > 0) {
    failed = true;
    console.log(`  FAIL\n    ${problems.join('\n    ')}`);
  } else {
    console.log('  OK');
  }
}

process.exit(failed ? 1 : 0);
