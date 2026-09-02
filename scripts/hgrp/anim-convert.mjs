/**
 * Bake Unity `.anim` clips into the character GLB as glTF animations (Stage F6).
 *
 *   node scripts/hgrp/anim-convert.mjs --src <rip-root> --char Pelica \
 *        --clips A_actor_pelica_gacha_ani_loop[,...]
 *   node scripts/hgrp/anim-convert.mjs --src <rip-root> --char Pelica --list
 *
 * Runs separately from convert.mjs: clip selection is a per-character judgement call, and
 * most of a rip's clips carry no curve data at all (see anim-clip.mjs).
 *
 * Why baking rather than a curve-for-curve translation: Unity keys carry Hermite tangents
 * with a stepped-tangent encoding that has no glTF equivalent, so the curves are sampled at
 * the clip's own rate and re-reduced to LINEAR keys within a tolerance.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MathUtils, NodeIO } from '@gltf-transform/core';
import { evaluateComponent, findCurveClips, parseAnimClip } from './anim-clip.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Unity's rig and the Blender-converted glTF differ by a mirror through the YZ plane
// (verified 2026-09-01 against the bind pose: 137/143 of the clip's constant translation
// curves land on the glb's rest transform under this rule and 16/143 without it, and
// Bip001_Pelvis/Bip001_Spine match to the last digit). A mirror maps a position to
// (-x, y, z) and conjugates a rotation to (x, -y, -z, w); scale is unaffected. Applied
// uniformly, the hierarchy stays self-consistent.
const CONVERT = {
  translation: (v) => [-v.x, v.y, v.z],
  rotation: (v) => [v.x, -v.y, -v.z, v.w],
  scale: (v) => [v.x, v.y, v.z],
};

// ...with one exception at the rig root. The glTF exporter parks its Z-up -> Y-up conversion
// on the scene root node, so a clip's world frame and the glb's differ by that rotation. It
// is undone once, on the topmost animated node (whose parent the clip does not touch), by
// pre-multiplying the inverse of the parent's world rotation; every descendant is then
// expressed in an already-aligned parent frame and needs nothing. The parent's world
// TRANSLATION is deliberately left alone — it is the model's placement, not an axis
// convention. Reading the rotation out of the file keeps this free of a hardcoded 90 degrees.
function quaternionMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quaternionRotateVector(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

function inverseWorldRotation(node) {
  const translation = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const scale = [1, 1, 1];
  MathUtils.decompose(node.getWorldMatrix(), translation, rotation, scale);
  return [-rotation[0], -rotation[1], -rotation[2], rotation[3]];
}

// Key-reduction tolerances, per component. Rotation is in quaternion units, translation and
// scale in the asset's metres.
const TOLERANCE = { rotation: 1e-3, translation: 1e-4, scale: 1e-4 };

const ACCESSOR_TYPE = { rotation: 'VEC4', translation: 'VEC3', scale: 'VEC3' };

function parseArgs(argv) {
  const args = { clips: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = argv[++i];
    else if (argv[i] === '--char') args.char = argv[++i];
    else if (argv[i] === '--clips') args.clips = argv[++i].split(',');
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--fps') args.fps = Number.parseFloat(argv[++i]);
    else if (argv[i] === '--list') args.list = true;
    else if (argv[i] === '--auto') args.auto = true;
  }
  if (!args.src || !args.char) {
    console.error(
      'Usage: node scripts/hgrp/anim-convert.mjs --src <rip-root> --char <Char> ' +
        '(--list | --auto | --clips <name>[,<name>...]) [--out <dir>] [--fps <n>]',
    );
    process.exit(1);
  }
  args.out = args.out || path.join(repoRoot, 'packages/web-client/assets/hgrp');
  return args;
}

/** glb node paths carry the prefab root that Unity clip paths are relative to. */
function buildNodeIndex(root) {
  const parents = new Map();
  for (const node of root.listNodes()) {
    for (const child of node.listChildren()) parents.set(child, node);
  }
  const pathOf = (node) => {
    const parts = [];
    for (let current = node; current; current = parents.get(current)) {
      parts.unshift(current.getName());
    }
    return parts.join('/');
  };

  const byPath = new Map();
  const pathByNode = new Map();
  for (const node of root.listNodes()) {
    const key = pathOf(node);
    byPath.set(key, node);
    pathByNode.set(node, key);
  }
  return { byPath, pathByNode, parents };
}

function sampleCurve(curve, times, rootCorrection) {
  const convert = CONVERT[curve.kind];
  const axes = curve.kind === 'rotation' ? ['x', 'y', 'z', 'w'] : ['x', 'y', 'z'];
  const stride = axes.length;
  const values = new Float32Array(times.length * stride);

  for (let i = 0; i < times.length; i++) {
    const raw = {};
    for (const axis of axes) raw[axis] = evaluateComponent(curve.keys, axis, times[i]);
    let converted = convert(raw);

    if (rootCorrection) {
      if (curve.kind === 'rotation') converted = quaternionMultiply(rootCorrection, converted);
      else if (curve.kind === 'translation') {
        converted = quaternionRotateVector(rootCorrection, converted);
      }
    }

    if (curve.kind === 'rotation') {
      const length = Math.hypot(converted[0], converted[1], converted[2], converted[3]) || 1;
      for (let c = 0; c < 4; c++) converted[c] /= length;
      // LINEAR interpolation takes the short arc only if consecutive keys share a hemisphere
      if (i > 0) {
        const previous = i * stride - stride;
        let dot = 0;
        for (let c = 0; c < 4; c++) dot += values[previous + c] * converted[c];
        if (dot < 0) for (let c = 0; c < 4; c++) converted[c] = -converted[c];
      }
    }

    values.set(converted, i * stride);
  }
  return { values, stride };
}

/**
 * Drop keys that the surrounding LINEAR segment already reproduces within `tolerance`. Most
 * joints of a character clip hold still, so this is the difference between a 6MB animation
 * and a few hundred KB.
 */
function reduceKeys(times, values, stride, tolerance) {
  const count = times.length;
  if (count <= 2) {
    return { times, values };
  }

  const kept = [0];
  for (let candidate = 1; candidate < count - 1; candidate++) {
    const anchor = kept[kept.length - 1];
    const next = candidate + 1;
    const span = times[next] - times[anchor];
    let fits = true;

    for (let probe = anchor + 1; probe <= candidate && fits; probe++) {
      const u = span > 0 ? (times[probe] - times[anchor]) / span : 0;
      for (let c = 0; c < stride; c++) {
        const lerped =
          values[anchor * stride + c] +
          (values[next * stride + c] - values[anchor * stride + c]) * u;
        if (Math.abs(lerped - values[probe * stride + c]) > tolerance) {
          fits = false;
          break;
        }
      }
    }
    if (!fits) kept.push(candidate);
  }
  kept.push(count - 1);

  const outTimes = new Float32Array(kept.length);
  const outValues = new Float32Array(kept.length * stride);
  for (let i = 0; i < kept.length; i++) {
    outTimes[i] = times[kept[i]];
    outValues.set(values.subarray(kept[i] * stride, kept[i] * stride + stride), i * stride);
  }
  return { times: outTimes, values: outValues };
}

function bakeClip(doc, buffer, index, prefix, clip, fps) {
  const animation = doc.createAnimation(clip.name);
  const step = 1 / fps;
  const frameCount = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) times[i] = Math.min(i * step, clip.duration);

  // A node the clip drives whose parent it does not is a rig root — see the CONVERT comment
  const driven = new Set(clip.curves.map((curve) => prefix + curve.path));

  let channels = 0;
  let keys = 0;
  let rigRoots = 0;
  const unmatched = new Set();
  const corrections = new Map();

  for (const curve of clip.curves) {
    const node = index.byPath.get(prefix + curve.path);
    if (!node) {
      unmatched.add(curve.path);
      continue;
    }

    if (!corrections.has(node)) {
      const parent = index.parents.get(node);
      const parentDriven = parent ? driven.has(index.pathByNode.get(parent)) : false;
      if (parent && !parentDriven) {
        corrections.set(node, inverseWorldRotation(parent));
        rigRoots++;
      } else {
        corrections.set(node, undefined);
      }
    }

    const sampled = sampleCurve(curve, times, corrections.get(node));
    const reduced = reduceKeys(times, sampled.values, sampled.stride, TOLERANCE[curve.kind]);

    const input = doc
      .createAccessor(`${clip.name}_${curve.kind}_in`)
      .setArray(reduced.times)
      .setType('SCALAR')
      .setBuffer(buffer);
    const output = doc
      .createAccessor(`${clip.name}_${curve.kind}_out`)
      .setArray(reduced.values)
      .setType(ACCESSOR_TYPE[curve.kind])
      .setBuffer(buffer);

    const sampler = doc
      .createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation('LINEAR');
    const channel = doc
      .createAnimationChannel()
      .setTargetNode(node)
      .setTargetPath(curve.kind)
      .setSampler(sampler);

    animation.addSampler(sampler).addChannel(channel);
    channels++;
    keys += reduced.times.length;
  }

  return { channels, keys, frameCount, rigRoots, unmatched: [...unmatched] };
}

// A clip qualifies as skeletal if it drives more than a handful of distinct node paths.
// Measured 2026-09-02 across two rips, the separation is total: real body clips carry
// 704-815 curves over 323-352 paths, while camera tracks and event stubs carry exactly 2
// curves over 1 unnamed path. Anything in between would be a fragment worth inspecting by
// hand, so the threshold sits far from both ends rather than at 1.
const MIN_ANIMATED_PATHS = 8;

/**
 * Clips to bake when no explicit list is given.
 *
 * Of a character's clips only a handful carry curve data at all — the rest are optimized
 * "muscle" clips whose samples AssetRipper does not export (Pelica 5/1324, Laevatian
 * 4/255). Those survivors still mix body animation with camera tracks, so the rig-coverage
 * test above is what separates them; filtering on a `_cam` suffix would only work until a
 * rip names something differently.
 *
 * Alphabetical order then puts a clip ahead of its own `_loop` variant, which is the
 * stage's clip 0 = entrance / clip 1 = idle convention.
 */
async function selectClipsAutomatically(clipDir) {
  const selected = [];
  for (const file of findCurveClips(clipDir)) {
    const clip = await parseAnimClip(path.join(clipDir, file));
    const paths = new Set(clip.curves.map((curve) => curve.path));
    if (paths.size >= MIN_ANIMATED_PATHS) selected.push(path.basename(file, '.anim'));
  }
  return selected.sort();
}

async function main() {
  const args = parseArgs(process.argv);
  const clipDir = path.join(args.src, args.char, 'AnimationClip');
  if (!fs.existsSync(clipDir)) {
    console.error(`[anim-convert] No AnimationClip directory at ${clipDir}`);
    process.exit(1);
  }

  if (args.list) {
    const usable = findCurveClips(clipDir);
    const total = fs.readdirSync(clipDir).filter((f) => f.endsWith('.anim')).length;
    console.log(`[anim-convert] ${usable.length} of ${total} clips carry curve data:`);
    for (const file of usable) {
      const bytes = fs.statSync(path.join(clipDir, file)).size;
      console.log(`  ${(bytes / 1024 / 1024).toFixed(1).padStart(6)} MB  ${file}`);
    }
    return;
  }
  if (args.auto && args.clips.length === 0) {
    args.clips = await selectClipsAutomatically(clipDir);
    if (args.clips.length === 0) {
      console.warn(`[anim-convert] --auto found no skeletal clips for ${args.char}, nothing to bake`);
      return;
    }
    console.log(`[anim-convert] --auto selected: ${args.clips.join(', ')}`);
  }
  if (args.clips.length === 0) {
    console.error('[anim-convert] Pass --clips <name>[,...], --auto or --list');
    process.exit(1);
  }

  const charDir = path.join(args.out, args.char.toLowerCase());
  const glbPath = path.join(charDir, `${args.char.toLowerCase()}.glb`);
  if (!fs.existsSync(glbPath)) {
    console.error(`[anim-convert] No GLB at ${glbPath} — run convert.mjs first`);
    process.exit(1);
  }

  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const root = doc.getRoot();

  // Re-running must replace, not stack, previously baked clips
  for (const existing of root.listAnimations()) existing.dispose();

  const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  const index = buildNodeIndex(root);
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const sceneRoots = scene.listChildren();
  if (sceneRoots.length !== 1) {
    console.error(
      `[anim-convert] Expected one scene root (Unity clip paths are relative to the prefab ` +
        `root), found ${sceneRoots.length}`,
    );
    process.exit(1);
  }
  const prefix = `${sceneRoots[0].getName()}/`;

  for (const name of args.clips) {
    const file = path.join(clipDir, name.endsWith('.anim') ? name : `${name}.anim`);
    if (!fs.existsSync(file)) {
      console.error(`[anim-convert] Missing clip ${file}`);
      process.exit(1);
    }

    const clip = await parseAnimClip(file);
    if (clip.curves.length === 0) {
      console.error(
        `[anim-convert] ${clip.name} has no readable curves — it is an optimized/muscle clip ` +
          `whose samples AssetRipper did not export (see --list)`,
      );
      process.exit(1);
    }

    const fps = args.fps || clip.sampleRate;
    const result = bakeClip(doc, buffer, index, prefix, clip, fps);
    console.log(
      `[anim-convert] ${clip.name}: ${clip.duration.toFixed(2)}s @ ${fps}fps ` +
        `(${result.frameCount} sampled frames) -> ${result.channels} channels, ` +
        `${result.keys} keys after reduction, ${result.rigRoots} rig root(s) re-framed`,
    );
    if (result.unmatched.length > 0) {
      console.warn(
        `[anim-convert]   ${result.unmatched.length} curve paths have no glb node ` +
          `(first: ${result.unmatched[0]})`,
      );
    }
  }

  await io.write(glbPath, doc);
  const bytes = fs.statSync(glbPath).size;
  console.log(
    `[anim-convert] Wrote ${glbPath} (${(bytes / 1024 / 1024).toFixed(1)} MB, ` +
      `${root.listAnimations().length} animation(s))`,
  );
}

main().catch((error) => {
  console.error('[anim-convert] Failed:', error);
  process.exit(1);
});
