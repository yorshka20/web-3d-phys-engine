/**
 * Bake an exported clip FBX onto a character glb's skeleton (docs/hgrp-clip-format.md).
 *
 * A clip FBX holds the character's node hierarchy — plain nodes in the FBX's own frames,
 * under the prefab root and whatever wrapper the export put above it — and one animation
 * take. The character glb's joints are the same hierarchy in Blender's BONE frames (the
 * armature importer re-orients every bone), so a clip node's local transform cannot be
 * copied onto its joint: the two frames differ by a fixed per-node basis change, and the
 * engine composes a clip's local TRS down the model's hierarchy.
 *
 * The bake removes that difference without knowing either convention. The character FBX's
 * node defaults are the bind pose the glb was built from, so for every joint the fixed offset
 * between its FBX frame and its glb frame is D(n) = P_fbx(n)^-1 * W_glb(n) — both rest world
 * matrices, in the one world the two files share (the glb's world equals the FBX's; Blender
 * parks the axis conversion on the scene root and compensates it in the bone frames). At any
 * time the joint's world transform is then W_fbx(n, t) * D(n), evaluated from the clip FBX's
 * curves (fbx-anim.mjs), and walking the model hierarchy top-down turns that into the joint's
 * local TRS. A node the clip does not drive composes to its rest transform by construction.
 * The output is the model's node hierarchy (meshes, skins, materials stripped) plus one
 * animation named after the clip, keys reduced to what LINEAR interpolation cannot reproduce.
 *
 * A humanoid clip's body is not in its FBX curves and is not baked here either: its muscle,
 * root, goal and parameter curves ship in the same glb as channel-less samplers named from the
 * animation's `extras.HGRP_humanoid` (writeHumanoidExtras), and the engine solves them against
 * whichever character plays the clip. The FBX curves still bake the secondary bones.
 */

import { NodeIO, PropertyType } from '@gltf-transform/core';
import { mat4, quat, vec3 } from 'gl-matrix';
import {
  fbxClipEvaluator,
  fbxHierarchy,
  fbxPathsBelow,
  fbxRestWorlds,
  fbxTimeline,
  quaternionFromEulerXYZ,
} from './fbx-anim.mjs';
import { fbxClusterBinds, readFbx } from './fbx-read.mjs';
import { Humanoid } from './humanoid.mjs';

// Key-reduction tolerances, per component. Rotation is in quaternion units, translation and
// scale in the asset's metres.
const TOLERANCE = { rotation: 1e-3, translation: 1e-4, scale: 1e-4 };
const ACCESSOR_TYPE = { rotation: 'VEC4', translation: 'VEC3', scale: 'VEC3' };

/**
 * Reduce a character document to the node hierarchy a clip needs: meshes, skins, materials,
 * textures and the accessors only they referenced go; nodes and the scene stay.
 */
export function stripToSkeleton(doc) {
  const root = doc.getRoot();
  // dispose() does not cascade: a mesh's primitives and morph targets outlive it and keep
  // their accessors referenced, so they go first.
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const target of primitive.listTargets()) target.dispose();
      primitive.dispose();
    }
  }
  for (const list of [
    root.listAnimations(),
    root.listMeshes(),
    root.listSkins(),
    root.listMaterials(),
    root.listTextures(),
    root.listCameras(),
  ]) {
    for (const property of list) property.dispose();
  }
  for (const accessor of root.listAccessors()) {
    const referenced = accessor
      .listParents()
      .some((parent) => parent.propertyType !== PropertyType.ROOT);
    if (!referenced) accessor.dispose();
  }
}

/**
 * Drop keys that the surrounding LINEAR segment already reproduces within `tolerance`. Most
 * joints of a character clip hold still, so this is the difference between a 6MB animation
 * and a few hundred KB.
 */
export function reduceKeys(times, values, stride, tolerance) {
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

// The joint the body hangs from: of the skinned joints, the one with the most skinned joints
// below it (the pelvis of a biped — `Bip001` on these rigs, found without naming it). A clip
// that keys it moves the body; one that does not is an overlay for secondary bones — cloth,
// hair, sleeves — which the export ships as short fragments meant to be layered, and which
// played alone leave the body in bind pose with its cloth flung a metre away.
function skinBodyRoot(doc) {
  const skinned = new Set();
  for (const skin of doc.getRoot().listSkins())
    for (const joint of skin.listJoints()) skinned.add(joint);
  let best;
  let bestCount = -1;
  const count = (node) => {
    let n = 0;
    const stack = [...node.listChildren()];
    while (stack.length > 0) {
      const child = stack.pop();
      if (skinned.has(child)) n++;
      stack.push(...child.listChildren());
    }
    return n;
  };
  for (const joint of skinned) {
    const n = count(joint);
    if (n > bestCount) {
      bestCount = n;
      best = joint;
    }
  }
  return best;
}

// Blender suffixes a duplicate name with .001, .002, ...; the FBX keeps the plain name and
// tells the nodes apart by their place in the hierarchy, which the path does too.
function plainName(node) {
  return node.getName().replace(/\.\d{3}$/, '');
}

// glb node -> name path below `top`, and the reverse map
export function glbPathsBelow(top) {
  const byNode = new Map();
  const byPath = new Map();
  const visit = (node, prefix) => {
    for (const child of node.listChildren()) {
      const path = prefix ? `${prefix}/${plainName(child)}` : plainName(child);
      byNode.set(child, path);
      if (!byPath.has(path)) byPath.set(path, child);
      visit(child, path);
    }
  };
  visit(top, '');
  return { byNode, byPath };
}

function glbRestWorlds(top) {
  const worlds = new Map();
  const local = mat4.create();
  const stack = [[top, undefined]];
  while (stack.length > 0) {
    const [node, parent] = stack.pop();
    mat4.fromRotationTranslationScale(
      local,
      node.getRotation(),
      node.getTranslation(),
      node.getScale(),
    );
    const world = mat4.create();
    if (parent) mat4.multiply(world, worlds.get(parent), local);
    else mat4.copy(world, local);
    worlds.set(node, world);
    for (const child of node.listChildren()) stack.push([child, node]);
  }
  return worlds;
}

/**
 * The character's bind pose in FBX frames, by node path below the prefab root: a skinned
 * bone's world matrix is its skin cluster's TransformLink; a node nothing is skinned to (IK
 * targets, sockets, nubs) hangs off its parent's bind by its own rest offset. The node
 * defaults alone are NOT the bind pose — the export leaves the prefab in a T-pose while the
 * meshes were skinned in an A-pose 0.4 m away at the hands — and the glb's rest is the latter.
 *
 * A bone skinned by several meshes can carry different bind matrices in their clusters (LOD
 * meshes and props were bound in another pose, metres away); the glb was built from one of
 * them, so the candidate closest to the glb's rest world matrix is the one the joint frames
 * are relative to. `modelGlbPath` supplies that rest.
 */
export async function readBindPose(modelFbxPath, modelGlbPath) {
  const tree = readFbx(modelFbxPath);
  const hierarchy = fbxHierarchy(tree);
  if (hierarchy.roots.length !== 1) {
    throw new Error(`${modelFbxPath}: expected one root node, found ${hierarchy.roots.length}`);
  }
  const clusterBinds = fbxClusterBinds(tree);
  const fbxPaths = fbxPathsBelow(hierarchy.roots[0]);
  const pathOfId = new Map([...fbxPaths].map(([path, node]) => [node.id, path]));

  const modelDoc = await new NodeIO().read(modelGlbPath);
  const modelRoot = modelDoc.getRoot();
  const tops = (modelRoot.getDefaultScene() ?? modelRoot.listScenes()[0])?.listChildren() ?? [];
  if (tops.length !== 1) {
    throw new Error(`${modelGlbPath}: expected one scene root, found ${tops.length}`);
  }
  const glbPaths = glbPathsBelow(tops[0]);
  const glbRest = glbRestWorlds(tops[0]);

  const worlds = new Map();
  const local = mat4.create();
  const r = quat.create();
  let skinned = 0;
  const ambiguous = [];
  const stack = [...hierarchy.roots];
  while (stack.length > 0) {
    const node = stack.pop();
    const candidates = clusterBinds.get(node.id);
    let world;
    if (candidates) {
      const glbNode = glbPaths.byPath.get(pathOfId.get(node.id));
      const rest = glbNode ? glbRest.get(glbNode) : undefined;
      let best = candidates[0];
      if (rest && candidates.length > 1) {
        let bestDifference = Infinity;
        for (const candidate of candidates) {
          let difference = 0;
          for (let i = 0; i < 16; i++)
            difference = Math.max(difference, Math.abs(candidate[i] - rest[i]));
          if (difference < bestDifference) {
            bestDifference = difference;
            best = candidate;
          }
        }
        if (bestDifference > 1e-3) ambiguous.push(`${node.name} (${bestDifference.toFixed(3)})`);
      }
      world = mat4.clone(best);
      skinned++;
    } else {
      quaternionFromEulerXYZ(r, node.rotation);
      mat4.fromRotationTranslationScale(local, r, node.translation, node.scale);
      world = mat4.create();
      if (node.parent) mat4.multiply(world, worlds.get(node.parent.id), local);
      else mat4.copy(world, local);
    }
    worlds.set(node.id, world);
    for (const child of node.children) stack.push(child);
  }
  if (ambiguous.length > 0) {
    console.warn(
      `[clips] ${ambiguous.length} bones have several cluster binds and none matches the glb rest ` +
        `(first: ${ambiguous.slice(0, 3).join(', ')})`,
    );
  }
  const byPath = new Map();
  for (const [path, node] of fbxPaths) byPath.set(path, worlds.get(node.id));
  // The node defaults themselves — the prefab's T-pose — keyed the same way; the humanoid
  // path relates the Avatar's skeleton to the FBX's through them (humanoid.mjs).
  const defaults = fbxRestWorlds(hierarchy);
  const restByPath = new Map();
  for (const [path, node] of fbxPaths) restByPath.set(path, defaults.get(node.id));
  // The glb's rest world matrices by the same paths: with `byPath`, the per-joint frame change
  // the bake applies and the Avatar binding ships
  const glbRestByPath = new Map();
  for (const [path, node] of glbPaths.byPath) glbRestByPath.set(path, glbRest.get(node));
  return {
    rootName: hierarchy.roots[0].name,
    byPath,
    restByPath,
    glbRestByPath,
    skinned,
    nodes: hierarchy.nodes.size,
  };
}

/**
 * Bake the clip FBX at `clipFbxPath` onto `modelDoc`'s hierarchy, in place: `modelDoc` loses
 * its meshes and gains one animation. `bindPose` is readBindPose() of the character FBX.
 * `animatorName` names the clip node that corresponds to the model's prefab root (the export's
 * manifest calls it the animator); when absent, the clip node named like the model's scene
 * root is used. `humanoid` — `{ rig, sidecar }` from humanoid.mjs — makes it a humanoid clip:
 * the body stays out of the channels and the sidecar's muscle, root, goal and parameter curves
 * ship as channel-less samplers referenced from the animation's `extras.HGRP_humanoid`
 * (docs/hgrp-humanoid-animation.md §4), solved by the engine against the character the clip
 * plays on; the timeline is then the sidecar's frame grid.
 */
export function bakeClipOntoModel(
  modelDoc,
  clipFbxPath,
  bindPose,
  { name, animatorName, humanoid } = {},
) {
  const bodyRoot = skinBodyRoot(modelDoc);
  stripToSkeleton(modelDoc);
  const modelRoot = modelDoc.getRoot();
  const scene = modelRoot.getDefaultScene() ?? modelRoot.listScenes()[0];
  const modelTops = scene?.listChildren() ?? [];
  if (modelTops.length !== 1) {
    throw new Error(`expected one scene root on the model, found ${modelTops.length}`);
  }
  const modelTop = modelTops[0];
  const modelPaths = glbPathsBelow(modelTop);
  const modelRest = glbRestWorlds(modelTop);
  const modelParents = new Map();
  for (const node of modelRoot.listNodes()) {
    for (const child of node.listChildren()) modelParents.set(child, node);
  }

  const clipTree = readFbx(clipFbxPath);
  const timeline = fbxTimeline(clipTree);
  const evaluator = fbxClipEvaluator(clipTree);
  const fbxNodes = [...evaluator.nodes.values()];
  // The export may wrap the prefab in a node of the same name (jsspsi's clips nest
  // `chr_0036_jsspsi_postmodel` inside `chr_0036_jsspsi_postmodel`), so of the nodes carrying
  // the animator's name the one whose subtree matches the model's paths is the join point.
  const wanted = new Set([animatorName, modelTop.getName()].filter(Boolean));
  let clipTop;
  let clipPaths;
  let bestMatches = -1;
  for (const candidate of fbxNodes.filter((node) => wanted.has(node.name))) {
    const paths = fbxPathsBelow(candidate);
    let matches = 0;
    for (const path of paths.keys()) if (modelPaths.byPath.has(path)) matches++;
    if (matches > bestMatches) {
      bestMatches = matches;
      clipTop = candidate;
      clipPaths = paths;
    }
  }
  if (!clipTop) {
    throw new Error(`the clip has no node named ${[...wanted].join(' or ')} to join on`);
  }
  const isDriven = (clipNode) => evaluator.driven.has(clipNode.id);

  // Per matched joint: the clip node driving it and the fixed frame offset D(n). A clip node
  // the curves leave alone is held at the model's bind pose while the FBX is evaluated, not at
  // the clip file's own default: the glb composes such a node to its rest, which is that bind
  // pose, and a driven child's local transform is only right if both sides agree on the
  // parent. A humanoid clip's FBX leaves the whole body undriven (the muscles pose it at play
  // time), so the twist helpers, fingers and hair under it depend on this.
  const matched = new Map();
  const unmatched = [];
  const restOverrides = new Map();
  let unposed = 0;
  for (const [path, clipNode] of clipPaths) {
    const modelNode = modelPaths.byPath.get(path);
    const driven = isDriven(clipNode);
    if (!modelNode) {
      if (driven) unmatched.push(path);
      continue;
    }
    const pose = bindPose.byPath.get(path);
    if (!driven) {
      if (pose) restOverrides.set(clipNode.id, pose);
      continue;
    }
    if (!pose) {
      unposed++;
      continue;
    }
    const offset = mat4.invert(mat4.create(), pose);
    mat4.multiply(offset, offset, modelRest.get(modelNode));
    matched.set(modelNode, { clipNode, offset });
  }
  if (unposed > 0) {
    throw new Error(`${unposed} driven joints have no bind pose in the character FBX`);
  }
  if (matched.size === 0) {
    throw new Error(
      `no driven clip node matches the model below ${clipTop.name} (${unmatched.length} driven, first ${unmatched[0]})`,
    );
  }

  // A humanoid clip is sampled on its sidecar's grid: the FBX curves only cover the secondary
  // bones and may end before the body does.
  const sidecar = humanoid?.sidecar;
  const grid = sidecar
    ? { start: sidecar.start, fps: sidecar.sampleRate, frameCount: sidecar.frames }
    : {
        start: timeline.start,
        fps: timeline.fps,
        frameCount: Math.round((timeline.stop - timeline.start) * timeline.fps) + 1,
      };
  const frameCount = grid.frameCount;
  const times = Float32Array.from({ length: frameCount }, (_, i) =>
    sidecar ? grid.start + i / grid.fps : Math.min(grid.start + i / grid.fps, timeline.stop),
  );
  const out = new Map(
    [...matched.keys()].map((node) => [
      node,
      {
        translation: new Float32Array(frameCount * 3),
        rotation: new Float32Array(frameCount * 4),
        scale: new Float32Array(frameCount * 3),
      },
    ]),
  );

  const order = [];
  {
    const stack = [modelTop];
    while (stack.length > 0) {
      const node = stack.pop();
      order.push(node);
      for (const child of node.listChildren()) stack.push(child);
    }
  }
  const local = mat4.create();
  const inverseParent = mat4.create();
  const t = vec3.create();
  const r = quat.create();
  const s = vec3.create();
  for (let frame = 0; frame < frameCount; frame++) {
    const clipWorlds = evaluator.worldAt(times[frame], restOverrides);
    const worlds = new Map();
    for (const node of order) {
      const parent = modelParents.get(node);
      const join = matched.get(node);
      const world = mat4.create();
      if (join) {
        mat4.multiply(world, clipWorlds.get(join.clipNode.id), join.offset);
      } else {
        mat4.fromRotationTranslationScale(
          local,
          node.getRotation(),
          node.getTranslation(),
          node.getScale(),
        );
        if (parent) mat4.multiply(world, worlds.get(parent), local);
        else mat4.copy(world, local);
      }
      worlds.set(node, world);
      const target = out.get(node);
      if (!target) continue;
      if (parent) {
        mat4.invert(inverseParent, worlds.get(parent));
        mat4.multiply(local, inverseParent, world);
      } else {
        mat4.copy(local, world);
      }
      mat4.getTranslation(t, local);
      mat4.getScaling(s, local);
      mat4.getRotation(r, local);
      quat.normalize(r, r);
      if (frame > 0) {
        // LINEAR interpolation takes the short arc only if consecutive keys share a hemisphere
        const previous = target.rotation.subarray((frame - 1) * 4, frame * 4);
        if (quat.dot(previous, r) < 0) quat.scale(r, r, -1);
      }
      target.translation.set(t, frame * 3);
      target.rotation.set(r, frame * 4);
      target.scale.set(s, frame * 3);
    }
  }

  const animation = modelDoc.createAnimation(name ?? timeline.name);
  const buffer = modelRoot.listBuffers()[0] ?? modelDoc.createBuffer();
  let channels = 0;
  let keys = 0;
  for (const [node, target] of out) {
    for (const path of ['translation', 'rotation', 'scale']) {
      const stride = path === 'rotation' ? 4 : 3;
      const values = target[path];
      // A scale the clip never moves off the rest value is not worth a channel
      if (path === 'scale') {
        const rest = node.getScale();
        let moves = false;
        for (let i = 0; i < values.length && !moves; i++) {
          if (Math.abs(values[i] - rest[i % 3]) > TOLERANCE.scale) moves = true;
        }
        if (!moves) continue;
      }
      const reduced = reduceKeys(times, values, stride, TOLERANCE[path]);
      const input = modelDoc
        .createAccessor(`${animation.getName()}_${path}_in`)
        .setArray(reduced.times)
        .setType('SCALAR')
        .setBuffer(buffer);
      const output = modelDoc
        .createAccessor(`${animation.getName()}_${path}_out`)
        .setArray(reduced.values)
        .setType(ACCESSOR_TYPE[path])
        .setBuffer(buffer);
      const sampler = modelDoc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation('LINEAR');
      const channel = modelDoc
        .createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(path)
        .setSampler(sampler);
      animation.addSampler(sampler).addChannel(channel);
      channels++;
      keys += reduced.times.length;
    }
  }
  if (humanoid) {
    keys += writeHumanoidExtras(modelDoc, animation, buffer, humanoid.rig, sidecar, times);
  }

  return {
    name: animation.getName(),
    duration: times[frameCount - 1],
    fps: grid.fps,
    frames: frameCount,
    humanoid: humanoid !== undefined,
    driven: matched.size,
    // A humanoid clip moves the body through its muscles even when no channel keys a joint
    drivesBody: humanoid !== undefined || (bodyRoot !== undefined && matched.has(bodyRoot)),
    channels,
    keys,
    unmatched,
    clipTop: clipTop.name,
  };
}

// Muscle values are unit-free (a fraction of the axis' limit, ~90° at 1), the root and goal
// translations normalized metres, so 1e-4 keeps everything well under a tenth of a degree
const HUMANOID_TOLERANCE = 1e-4;

/**
 * Ship the sidecar's body curves in the animation as samplers no channel targets — the
 * muscles (SCALAR), the root and the four goals (VEC3 + VEC4, normalized as the clip stores
 * them), the Animator parameters (SCALAR) — and name them from `extras.HGRP_humanoid` by
 * sampler index. Curves the clip does not key are left out: the engine fills them from the
 * character's default pose. Returns the number of keys written.
 */
function writeHumanoidExtras(doc, animation, buffer, rig, sidecar, times) {
  let keys = 0;
  const addSampler = (label, values, stride, type, tolerance) => {
    const reduced = reduceKeys(times, values, stride, tolerance);
    const input = doc
      .createAccessor(`${animation.getName()}_${label}_in`)
      .setArray(reduced.times)
      .setType('SCALAR')
      .setBuffer(buffer);
    const output = doc
      .createAccessor(`${animation.getName()}_${label}_out`)
      .setArray(reduced.values)
      .setType(type)
      .setBuffer(buffer);
    const sampler = doc
      .createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation('LINEAR');
    animation.addSampler(sampler);
    keys += reduced.times.length;
    return animation.listSamplers().indexOf(sampler);
  };
  const column = (source, stride, offset) => {
    const out = new Float32Array(sidecar.frames);
    for (let f = 0; f < sidecar.frames; f++) out[f] = source[f * stride + offset];
    return out;
  };
  const pair = (label, t, q) => ({
    translation: addSampler(`${label}T`, Float32Array.from(t), 3, 'VEC3', HUMANOID_TOLERANCE),
    rotation: addSampler(`${label}Q`, Float32Array.from(q), 4, 'VEC4', TOLERANCE.rotation),
  });
  const extras = {
    avatar: rig.name,
    sampleRate: sidecar.sampleRate,
    settings: sidecar.settings,
    muscles: {},
    goals: {},
    parameters: [],
  };
  if (sidecar.rootPresent) extras.root = pair('Root', sidecar.rootT, sidecar.rootQ);
  for (const goal of Humanoid.HUMANOID_GOALS) {
    if (sidecar.goalPresent[goal]) {
      extras.goals[goal] = pair(goal, sidecar.goals[goal].t, sidecar.goals[goal].q);
    }
  }
  Humanoid.MUSCLES.forEach((name, m) => {
    if (!sidecar.musclePresent[m]) return;
    extras.muscles[name] = addSampler(
      `muscle${m}`,
      column(sidecar.muscles, Humanoid.MUSCLE_COUNT, m),
      1,
      'SCALAR',
      HUMANOID_TOLERANCE,
    );
  });
  for (const parameter of sidecar.parameters) {
    const entry = {
      hash: parameter.hash,
      sampler: addSampler(
        `param${parameter.hash}`,
        parameter.values,
        1,
        'SCALAR',
        HUMANOID_TOLERANCE,
      ),
    };
    if (parameter.name) entry.name = parameter.name;
    extras.parameters.push(entry);
  }
  animation.setExtras({ HGRP_humanoid: extras });
  return keys;
}

/** Read the model glb, bake the clip FBX onto it, write `outPath`; returns the bake report. */
export async function writeClipGlb(modelGlbPath, bindPose, clipFbxPath, outPath, options) {
  const io = new NodeIO();
  const modelDoc = await io.read(modelGlbPath);
  const report = bakeClipOntoModel(modelDoc, clipFbxPath, bindPose, options);
  await io.write(outPath, modelDoc);
  return report;
}
