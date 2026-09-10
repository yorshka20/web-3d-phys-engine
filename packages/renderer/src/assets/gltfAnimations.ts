import type { Animation, Document, Node } from '@gltf-transform/core';
import { quat } from 'gl-matrix';
import type {
  GLTFAnimation,
  GLTFAnimationChannel,
  GLTFAnimationSampler,
  GLTFModel,
  GLTFNode,
  GLTFSkin,
} from './GltfModel';
import { readHumanoidClipExtras } from './humanoid/clip';

// glTF animation channels address nodes by index inside their own document, so a clip that
// ships in its own file — scripts/hgrp/anim-convert.mjs writes one glb per clip holding the
// character's node hierarchy, no meshes, and one animation — is joined onto a model by node
// PATH: the node names from the scene root down, the root itself excluded so a clip exported
// under another prefab name still matches. It is the key the baker matched the Unity curves on.

export function convertGLTFAnimations(
  animations: readonly Animation[],
  nodeIndexOf: (node: Node) => number | undefined,
): { animations: GLTFAnimation[]; droppedChannels: number } {
  let droppedChannels = 0;
  const converted = animations.map((animation) => {
    const sourceSamplers = animation.listSamplers();
    const samplerIndices = new Map(sourceSamplers.map((sampler, i) => [sampler, i]));
    let duration = 0;

    const samplers: GLTFAnimationSampler[] = sourceSamplers.map((sampler) => {
      const input = new Float32Array((sampler.getInput()?.getArray() as ArrayLike<number>) ?? []);
      duration = Math.max(duration, input[input.length - 1] ?? 0);
      return {
        input,
        output: new Float32Array((sampler.getOutput()?.getArray() as ArrayLike<number>) ?? []),
        interpolation: (sampler.getInterpolation() ??
          'LINEAR') as GLTFAnimationSampler['interpolation'],
      };
    });

    // A channel with no target node or sampler is legal-but-inert glTF; one whose node the
    // model does not have belongs to another rig. Both are dropped here so the sampling loop
    // stays free of null checks.
    const channels = animation.listChannels().flatMap((channel): GLTFAnimationChannel[] => {
      const target = channel.getTargetNode();
      const sampler = channel.getSampler();
      const path = channel.getTargetPath();
      const node = target ? nodeIndexOf(target) : undefined;
      if (node === undefined || !sampler || !path) {
        droppedChannels++;
        return [];
      }
      return [
        {
          node,
          path: path as GLTFAnimationChannel['path'],
          sampler: samplerIndices.get(sampler)!,
        },
      ];
    });

    return {
      name: animation.getName(),
      channels,
      samplers,
      duration,
      humanoid: readHumanoidClipExtras(animation.getExtras(), samplers),
    };
  });
  return { animations: converted, droppedChannels };
}

/**
 * Extract the posing data a static load throws away: the node hierarchy (kept as local TRS
 * so animation channels can drive t/r/s independently), the skins' joint lists and inverse
 * bind matrices, and the animation clips. Returns nothing for a document with neither a
 * skin nor an animation, so static models keep their flattened-instance representation.
 */
export function extractGLTFRig(doc: Document): Partial<GLTFModel> {
  const root = doc.getRoot();
  const sourceSkins = root.listSkins();
  const sourceAnimations = root.listAnimations();
  if (sourceSkins.length === 0 && sourceAnimations.length === 0) {
    return {};
  }

  const sourceNodes = root.listNodes();
  const nodeIndices = new Map<Node, number>(sourceNodes.map((node, i) => [node, i]));

  const nodes: GLTFNode[] = sourceNodes.map((node) => ({
    name: node.getName(),
    translation: [...node.getTranslation()] as [number, number, number],
    rotation: [...node.getRotation()] as [number, number, number, number],
    scale: [...node.getScale()] as [number, number, number],
    children: node.listChildren().map((child) => nodeIndices.get(child)!),
  }));

  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const roots = (scene?.listChildren() ?? []).map((node) => nodeIndices.get(node)!);

  const skins: GLTFSkin[] = sourceSkins.map((skin) => ({
    joints: skin.listJoints().map((joint) => nodeIndices.get(joint)!),
    inverseBindMatrices: new Float32Array(
      (skin.getInverseBindMatrices()?.getArray() as ArrayLike<number>) ?? [],
    ),
  }));

  const { animations } = convertGLTFAnimations(sourceAnimations, (node) => nodeIndices.get(node));

  return { nodes, roots, skins, animations };
}

// ---- sampling ---------------------------------------------------------------------------------

const scratchQuatA = quat.create();
const scratchQuatB = quat.create();
const scratchQuatOut = quat.create();

/**
 * Write one interpolated keyframe value of `sampler` at `time` into `out` at `outOffset`
 * (`stride` floats). Quaternions slerp; the rest lerp. CUBICSPLINE output packs
 * (inTangent, value, outTangent) per key. Outside the key range the nearest key holds.
 */
export function sampleGLTFSampler(
  sampler: GLTFAnimationSampler,
  time: number,
  stride: number,
  isQuaternion: boolean,
  out: Float32Array,
  outOffset: number,
): void {
  const { input, output, interpolation } = sampler;
  const keyCount = input.length;
  if (keyCount === 0) {
    return;
  }

  const valueStride = interpolation === 'CUBICSPLINE' ? stride * 3 : stride;
  const valueOffset = interpolation === 'CUBICSPLINE' ? stride : 0;

  if (keyCount === 1 || time <= input[0]) {
    out.set(output.subarray(valueOffset, valueOffset + stride), outOffset);
    return;
  }
  if (time >= input[keyCount - 1]) {
    const base = (keyCount - 1) * valueStride + valueOffset;
    out.set(output.subarray(base, base + stride), outOffset);
    return;
  }

  const next = findKeyframe(input, time);
  const prev = next - 1;
  const span = input[next] - input[prev];
  const t = span > 0 ? (time - input[prev]) / span : 0;

  const a = prev * valueStride + valueOffset;
  const b = next * valueStride + valueOffset;

  if (interpolation === 'STEP') {
    out.set(output.subarray(a, a + stride), outOffset);
    return;
  }

  if (interpolation === 'CUBICSPLINE') {
    cubicSpline(output, prev, next, valueStride, stride, span, t, out, outOffset);
  } else if (isQuaternion) {
    quat.set(scratchQuatA, output[a], output[a + 1], output[a + 2], output[a + 3]);
    quat.set(scratchQuatB, output[b], output[b + 1], output[b + 2], output[b + 3]);
    quat.slerp(scratchQuatOut, scratchQuatA, scratchQuatB, t);
    out.set(scratchQuatOut, outOffset);
  } else {
    for (let i = 0; i < stride; i++) {
      out[outOffset + i] = output[a + i] + (output[b + i] - output[a + i]) * t;
    }
  }

  if (isQuaternion) {
    normalizeQuaternion(out, outOffset);
  }
}

/** Index of the first keyframe strictly after `time`; callers guarantee one exists. */
function findKeyframe(input: Float32Array, time: number): number {
  let low = 0;
  let high = input.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (input[mid] <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function cubicSpline(
  output: Float32Array,
  prev: number,
  next: number,
  valueStride: number,
  stride: number,
  span: number,
  t: number,
  out: Float32Array,
  outOffset: number,
): void {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const prevValue = prev * valueStride + stride;
  const prevOutTangent = prev * valueStride + stride * 2;
  const nextInTangent = next * valueStride;
  const nextValue = next * valueStride + stride;

  for (let i = 0; i < stride; i++) {
    out[outOffset + i] =
      h00 * output[prevValue + i] +
      h10 * span * output[prevOutTangent + i] +
      h01 * output[nextValue + i] +
      h11 * span * output[nextInTangent + i];
  }
}

function normalizeQuaternion(out: Float32Array, offset: number): void {
  const x = out[offset];
  const y = out[offset + 1];
  const z = out[offset + 2];
  const w = out[offset + 3];
  const length = Math.hypot(x, y, z, w);
  if (length > 0) {
    out[offset] = x / length;
    out[offset + 1] = y / length;
    out[offset + 2] = z / length;
    out[offset + 3] = w / length;
  }
}

// Path -> node index for every node below the model's scene roots ("Bip001/Bip001_Pelvis").
export function gltfNodePaths(
  nodes: readonly GLTFNode[],
  roots: readonly number[],
): Map<string, number> {
  const paths = new Map<string, number>();
  const visit = (index: number, prefix: string) => {
    for (const child of nodes[index].children) {
      const path = prefix ? `${prefix}/${nodes[child].name}` : nodes[child].name;
      paths.set(path, child);
      visit(child, path);
    }
  };
  for (const root of roots) {
    visit(root, '');
  }
  return paths;
}

function documentNodePaths(doc: Document): Map<Node, string> {
  const paths = new Map<Node, string>();
  const visit = (node: Node, prefix: string) => {
    for (const child of node.listChildren()) {
      const path = prefix ? `${prefix}/${child.getName()}` : child.getName();
      paths.set(child, path);
      visit(child, path);
    }
  };
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  for (const node of scene?.listChildren() ?? []) {
    visit(node, '');
  }
  return paths;
}

// Append a clip document's animations to a rigged model, channels re-addressed to the model's
// nodes by path. Returns what was attached and how many channels named a node the model lacks.
export function attachGLTFClips(
  model: GLTFModel,
  clipDoc: Document,
): { attached: GLTFAnimation[]; droppedChannels: number } {
  if (!model.nodes || !model.roots) {
    throw new Error('attachGLTFClips: the model carries no node hierarchy to join clips onto');
  }
  const modelPaths = gltfNodePaths(model.nodes, model.roots);
  const clipPaths = documentNodePaths(clipDoc);
  const { animations, droppedChannels } = convertGLTFAnimations(
    clipDoc.getRoot().listAnimations(),
    (node) => {
      const path = clipPaths.get(node);
      return path === undefined ? undefined : modelPaths.get(path);
    },
  );
  model.animations = [...(model.animations ?? []), ...animations];
  return { attached: animations, droppedChannels };
}
