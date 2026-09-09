import type { Animation, Document, Node } from '@gltf-transform/core';
import type {
  GLTFAnimation,
  GLTFAnimationChannel,
  GLTFAnimationSampler,
  GLTFModel,
  GLTFNode,
} from './GltfModel';

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

    return { name: animation.getName(), channels, samplers, duration };
  });
  return { animations: converted, droppedChannels };
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
