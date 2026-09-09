import { Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import type { GLTFModel, GLTFNode } from '../GltfModel';
import { attachGLTFClips, gltfNodePaths } from '../gltfAnimations';

const node = (name: string, children: number[] = []): GLTFNode => ({
  name,
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
  children,
});

// The model's hierarchy as the loader keeps it: prefab root -> Root -> Bip001 -> Pelvis.
function riggedModel(): GLTFModel {
  return {
    meshes: [],
    instances: [],
    nodes: [
      node('chr_0004_pelica_uimodel', [1]),
      node('Root', [2]),
      node('Bip001', [3]),
      node('Bip001_Pelvis'),
    ],
    roots: [0],
    skins: [],
  };
}

// A clip document: the same hierarchy under a different prefab name, plus one node the model
// does not have, and one animation driving two of them.
function clipDocument(): Document {
  const doc = new Document();
  const prefab = doc.createNode('P_actor_pelica');
  const root = doc.createNode('Root');
  const bip = doc.createNode('Bip001');
  const pelvis = doc.createNode('Bip001_Pelvis');
  const stray = doc.createNode('Prop_jnt');
  prefab.addChild(root);
  root.addChild(bip);
  bip.addChild(pelvis);
  pelvis.addChild(stray);
  doc.createScene('scene').addChild(prefab);

  const buffer = doc.createBuffer();
  const input = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Float32Array([0, 0.5, 2]))
    .setBuffer(buffer);
  const output = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 0, 1, 0, 0, 2, 0]))
    .setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output);
  const animation = doc.createAnimation('gacha').addSampler(sampler);
  for (const target of [pelvis, root, stray]) {
    animation.addChannel(
      doc
        .createAnimationChannel()
        .setTargetNode(target)
        .setTargetPath('translation')
        .setSampler(sampler),
    );
  }
  return doc;
}

describe('external glTF clips', () => {
  it("keys a model's nodes by path below the scene root", () => {
    const model = riggedModel();
    expect([...gltfNodePaths(model.nodes!, model.roots!).entries()]).toEqual([
      ['Root', 1],
      ['Root/Bip001', 2],
      ['Root/Bip001/Bip001_Pelvis', 3],
    ]);
  });

  it('joins a clip onto the model by node path, whatever the prefab root is called', () => {
    const model = riggedModel();
    const { attached, droppedChannels } = attachGLTFClips(model, clipDocument());
    expect(attached).toHaveLength(1);
    expect(attached[0].name).toBe('gacha');
    expect(attached[0].duration).toBe(2);
    expect(attached[0].channels).toEqual([
      { node: 3, path: 'translation', sampler: 0 },
      { node: 1, path: 'translation', sampler: 0 },
    ]);
    expect(droppedChannels).toBe(1);
    expect(attached[0].samplers[0].output).toHaveLength(9);
    expect(model.animations).toEqual(attached);
  });

  it('appends to clips the model already carries', () => {
    const model = riggedModel();
    attachGLTFClips(model, clipDocument());
    attachGLTFClips(model, clipDocument());
    expect(model.animations?.map((clip) => clip.name)).toEqual(['gacha', 'gacha']);
  });

  it('refuses a model without a node hierarchy', () => {
    expect(() => attachGLTFClips({ meshes: [], instances: [] }, clipDocument())).toThrow(
      /node hierarchy/,
    );
  });
});
