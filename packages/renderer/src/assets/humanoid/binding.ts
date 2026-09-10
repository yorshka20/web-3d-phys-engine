import { quat, vec3 } from 'gl-matrix';
import type { GLTFModel } from '../GltfModel';
import { gltfNodePaths } from '../gltfAnimations';
import type { GLTFHumanoidClip } from './clip';
import { sampleHumanoidClip } from './clip';
import {
  createHumanoidPose,
  MUSCLE_COUNT,
  parseAvatar,
  solveHumanoidPose,
  type HumanoidPose,
  type HumanoidRig,
  type HumanoidRoot,
} from './humanoid';

/**
 * A character's Avatar bound to its glb: what turns a solved pose — Unity space, on the
 * Avatar's skeleton — into the glb's joint transforms. The solver's output is written the way
 * Unity's Animator writes onto a character: the hips' transform and the human bones' local
 * rotations; every other local transform of the Avatar's nodes is the prefab's (`locals` — the
 * translations of the human bones, all of a node no muscle drives, such as the pelvis).
 *
 * Between the two spaces sit two fixed changes per joint that the converter measures and ships
 * in `avatar.binding.json` (scripts/hgrp): the export's mirror in x (Unity → FBX), and the
 * bone re-orientation between the FBX's joint frames and the glb's (`frames`, the same offset
 * the generic clip bake applies). A joint's glb-local transform is therefore
 * `frame(parent)⁻¹ · mirror(unityLocal) · frame(joint)`.
 */
export interface HumanoidModelBinding {
  rig: HumanoidRig;
  /** glTF node index per rig node. */
  nodes: Int32Array;
  /** Per rig node: the FBX-frame → glb-frame change as rotation xyzw then translation (7 floats). */
  frames: Float64Array;
  /** Per rig node: the prefab's local transform, Unity space, as rotation xyzw then translation. */
  locals: Float64Array;
  /** Per rig node, 1 when a human bone (its rotation comes from the solver). */
  humanBoneNodes: Uint8Array;
  /** The character's default pose in muscle space — the bind pose — for curves a clip lacks. */
  defaults: { muscles: Float64Array; root: HumanoidRoot };
  /** Solver working set, reused every frame. */
  scratch: { pose: HumanoidPose; worlds: Float64Array; muscles: Float64Array; root: HumanoidRoot };
}

interface BindingJson {
  avatar: string;
  nodes: {
    path: string;
    frame: { rotation: number[]; translation: number[] };
    local: { rotation: number[]; translation: number[] };
  }[];
  defaults: { muscles: number[]; root: { translation: number[]; rotation: number[] } };
}

/**
 * Bind the Avatar (`avatarJson`, the export's avatar.json) to `model` through the converter's
 * `avatar.binding.json`, and hang the binding on `model.humanoid`. Throws when the binding was
 * made for another Avatar or names a node the model lacks — the converter checks both, so a
 * mismatch means the files beside the model are not from one conversion.
 */
export function attachHumanoidRig(
  model: GLTFModel,
  avatarJson: unknown,
  bindingJson: unknown,
): HumanoidModelBinding {
  if (!model.nodes || !model.roots) {
    throw new Error('attachHumanoidRig: the model carries no node hierarchy');
  }
  const rig = parseAvatar(avatarJson);
  const binding = bindingJson as BindingJson;
  if (binding?.avatar !== rig.name) {
    throw new Error(
      `attachHumanoidRig: the binding is for ${binding?.avatar}, the Avatar is ${rig.name}`,
    );
  }
  if (
    binding.nodes?.length !== rig.nodes.length ||
    binding.defaults?.muscles?.length !== MUSCLE_COUNT
  ) {
    throw new Error('attachHumanoidRig: the binding does not describe every node of the Avatar');
  }
  const paths = gltfNodePaths(model.nodes, model.roots);
  const n = rig.nodes.length;
  const nodes = new Int32Array(n);
  const frames = new Float64Array(n * 7);
  const locals = new Float64Array(n * 7);
  rig.nodes.forEach((node, i) => {
    const entry = binding.nodes[i];
    if (!entry?.frame || !entry.local) {
      throw new Error(`attachHumanoidRig: binding node ${i} lacks its frame or local transform`);
    }
    if (entry.path !== node.path) {
      throw new Error(
        `attachHumanoidRig: binding node ${i} is ${entry.path}, the Avatar's is ${node.path}`,
      );
    }
    const index = paths.get(node.path);
    if (index === undefined) {
      throw new Error(`attachHumanoidRig: the model has no node ${node.path}`);
    }
    nodes[i] = index;
    frames.set(entry.frame.rotation, i * 7);
    frames.set(entry.frame.translation, i * 7 + 4);
    locals.set(entry.local.rotation, i * 7);
    locals.set(entry.local.translation, i * 7 + 4);
  });
  const humanBoneNodes = new Uint8Array(n);
  for (const index of rig.bones) if (index >= 0) humanBoneNodes[index] = 1;
  const bound: HumanoidModelBinding = {
    rig,
    nodes,
    frames,
    locals,
    humanBoneNodes,
    defaults: {
      muscles: Float64Array.from(binding.defaults.muscles),
      root: {
        translation: vec3.fromValues(
          ...(binding.defaults.root.translation as [number, number, number]),
        ),
        rotation: quat.fromValues(
          ...(binding.defaults.root.rotation as [number, number, number, number]),
        ),
      },
    },
    scratch: {
      pose: createHumanoidPose(rig),
      worlds: new Float64Array(n * 16),
      muscles: new Float64Array(MUSCLE_COUNT),
      root: { translation: vec3.create(), rotation: quat.create() },
    },
  };
  model.humanoid = bound;
  return bound;
}

const localQ = quat.create();
const localT = vec3.create();
const frameQ = quat.create();
const frameT = vec3.create();
const parentQInverse = quat.create();
const moved = vec3.create();

/**
 * Write the binding's solved pose (`scratch.pose`) as glb-local TRS of the Avatar's nodes into
 * per-node buffers laid out like the skeleton's (3 and 4 floats per glTF node): the hips from
 * the solver, the other human bones' rotations from the solver over the prefab's translations,
 * every other node the prefab's local transform. The Avatar's root node (no Avatar parent)
 * keeps the glb's rest.
 */
export function writeHumanoidPose(
  binding: HumanoidModelBinding,
  translations: Float32Array,
  rotations: Float32Array,
): void {
  const { rig, frames, locals, nodes } = binding;
  const pose = binding.scratch.pose;
  const hips = rig.bones[0];
  const isHumanBone = binding.humanBoneNodes;
  for (let i = 0; i < rig.nodes.length; i++) {
    const parent = rig.nodes[i].parent;
    if (parent < 0) continue;
    // Unity local → FBX local: the export mirrors x, which conjugates a rotation by negating y and z
    if (isHumanBone[i]) {
      quat.set(
        localQ,
        pose.rotations[i * 4],
        -pose.rotations[i * 4 + 1],
        -pose.rotations[i * 4 + 2],
        pose.rotations[i * 4 + 3],
      );
    } else {
      quat.set(localQ, locals[i * 7], -locals[i * 7 + 1], -locals[i * 7 + 2], locals[i * 7 + 3]);
    }
    if (i === hips) {
      vec3.set(
        localT,
        -pose.translations[i * 3],
        pose.translations[i * 3 + 1],
        pose.translations[i * 3 + 2],
      );
    } else {
      vec3.set(localT, -locals[i * 7 + 4], locals[i * 7 + 5], locals[i * 7 + 6]);
    }
    // · frame(joint)
    quat.set(frameQ, frames[i * 7], frames[i * 7 + 1], frames[i * 7 + 2], frames[i * 7 + 3]);
    vec3.set(frameT, frames[i * 7 + 4], frames[i * 7 + 5], frames[i * 7 + 6]);
    vec3.transformQuat(moved, frameT, localQ);
    vec3.add(localT, localT, moved);
    quat.multiply(localQ, localQ, frameQ);
    // frame(parent)⁻¹ ·
    quat.set(
      parentQInverse,
      frames[parent * 7],
      frames[parent * 7 + 1],
      frames[parent * 7 + 2],
      frames[parent * 7 + 3],
    );
    quat.conjugate(parentQInverse, parentQInverse);
    vec3.set(frameT, frames[parent * 7 + 4], frames[parent * 7 + 5], frames[parent * 7 + 6]);
    vec3.sub(localT, localT, frameT);
    vec3.transformQuat(localT, localT, parentQInverse);
    quat.multiply(localQ, parentQInverse, localQ);
    quat.normalize(localQ, localQ);
    const node = nodes[i];
    translations.set(localT, node * 3);
    rotations.set(localQ, node * 4);
  }
}

/**
 * Pose a bound model from a humanoid clip at `time`: sample the muscles and root, solve on
 * the Avatar's skeleton, and write the human bones' glb-local TRS into the skeleton buffers.
 * A clip's generic channels are applied after this by the caller, so a bone keyed both ways
 * takes the channel.
 */
export function poseHumanoidClip(
  binding: HumanoidModelBinding,
  clip: GLTFHumanoidClip,
  time: number,
  translations: Float32Array,
  rotations: Float32Array,
): void {
  const { scratch, rig, defaults } = binding;
  sampleHumanoidClip(clip, time, defaults, scratch.muscles, scratch.root);
  solveHumanoidPose(rig, scratch.muscles, 0, scratch.root, scratch.pose, scratch.worlds);
  writeHumanoidPose(binding, translations, rotations);
}
