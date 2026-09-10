import { NodeIO } from '@gltf-transform/core';
import { mat4, quat, vec3 } from 'gl-matrix';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GLTFAnimation, GLTFModel, GLTFNode } from '../../GltfModel';
import { attachGLTFClips, extractGLTFRig, sampleGLTFSampler } from '../../gltfAnimations';
import { attachHumanoidRig, poseHumanoidClip, type HumanoidModelBinding } from '../binding';
import { sampleHumanoidClip } from '../clip';
import { clipGoalToRootSpace, HUMAN_BONES, type HumanoidGoal } from '../humanoid';

// A converted character folder, when the machine-local assets are present (scripts/hgrp/
// convert.mjs with --humanoid-src writes the model, avatar.json, avatar.binding.json and the
// clips): yvonne by default, or the folder HGRP_HUMANOID_ASSETS names with a clip whose goals
// sit on its own rig to a few millimetres (`interact_camera_01` does on every character).
const assets =
  process.env.HGRP_HUMANOID_ASSETS ??
  resolve(__dirname, '../../../../../web-client/assets/hgrp/yvonne');
const actor = basename(assets);
const files = {
  model: resolve(assets, `${actor}.glb`),
  avatar: resolve(assets, 'avatar.json'),
  binding: resolve(assets, 'avatar.binding.json'),
  clip: resolve(assets, `clips/A_actor_${actor}_interact_camera_01.glb`),
};
const present = Object.values(files).every((file) => existsSync(file));

// A hand goal is the hand joint itself (a foot goal is the sole, one foot length along the
// foot's axis — humanoid.ts goalPosition), so the hands compare without any axes.
const HAND_GOALS: HumanoidGoal[] = ['LeftHand', 'RightHand'];

describe.skipIf(!present)(`humanoid clip on the bound ${actor} model`, () => {
  let model: GLTFModel;
  let nodes: GLTFNode[];
  let clip: GLTFAnimation;
  let binding: HumanoidModelBinding;
  beforeAll(async () => {
    const io = new NodeIO();
    model = extractGLTFRig(await io.read(files.model)) as GLTFModel;
    binding = attachHumanoidRig(
      model,
      JSON.parse(readFileSync(files.avatar, 'utf8')),
      JSON.parse(readFileSync(files.binding, 'utf8')),
    );
    attachGLTFClips(model, await io.read(files.clip));
    clip = model.animations![0];
    nodes = model.nodes!;
  });

  // Compose the skeleton the way SkeletalAnimationSystem does, down from the scene roots
  function worldMatrices(translations: Float32Array, rotations: Float32Array): Float32Array {
    const worlds = new Float32Array(nodes.length * 16);
    const local = mat4.create();
    const stack: [number, number][] = model.roots!.map((root) => [root, -1]);
    while (stack.length > 0) {
      const [index, parent] = stack.pop()!;
      mat4.fromRotationTranslationScale(
        local,
        rotations.subarray(index * 4, index * 4 + 4) as unknown as quat,
        translations.subarray(index * 3, index * 3 + 3) as unknown as vec3,
        nodes[index].scale,
      );
      const world = worlds.subarray(index * 16, index * 16 + 16) as unknown as mat4;
      if (parent < 0) mat4.copy(world, local);
      else
        mat4.multiply(
          world,
          worlds.subarray(parent * 16, parent * 16 + 16) as unknown as mat4,
          local,
        );
      for (const child of nodes[index].children) stack.push([child, index]);
    }
    return worlds;
  }

  it('carries the muscle curves as channel-less samplers', () => {
    expect(clip.humanoid).toBeDefined();
    expect(clip.humanoid!.muscles.filter(Boolean).length).toBeGreaterThan(40);
    expect(clip.humanoid!.root).toBeDefined();
    expect(HAND_GOALS.every((goal) => clip.humanoid!.goals[goal])).toBe(true);
    expect(clip.duration).toBeGreaterThan(1);
  });

  it('puts the solved hands on the clip’s own goals, in the glb’s world', () => {
    const translations = new Float32Array(nodes.length * 3);
    const rotations = new Float32Array(nodes.length * 4);
    const scratchMuscles = new Float64Array(binding.scratch.muscles.length);
    const root = { translation: vec3.create(), rotation: quat.create() };
    const goalOut = new Float32Array(3);
    for (const time of [0, clip.duration * 0.37, clip.duration * 0.8]) {
      nodes.forEach((node, i) => {
        translations.set(node.translation, i * 3);
        rotations.set(node.rotation, i * 4);
      });
      poseHumanoidClip(binding, clip.humanoid!, time, translations, rotations);
      const worlds = worldMatrices(translations, rotations);
      sampleHumanoidClip(clip.humanoid!, time, binding.defaults, scratchMuscles, root);
      for (const goal of HAND_GOALS) {
        // Stored goal: normalized, in the body's frame -> Unity root space (metres) -> the
        // export's mirrored world, which the glb shares
        sampleGLTFSampler(clip.humanoid!.goals[goal]!.translation, time, 3, false, goalOut, 0);
        const expected = clipGoalToRootSpace(
          vec3.create(),
          binding.rig,
          root,
          vec3.fromValues(goalOut[0], goalOut[1], goalOut[2]),
        );
        expected[0] = -expected[0];
        const joint = binding.nodes[binding.rig.bones[HUMAN_BONES.indexOf(goal)]];
        const actual = mat4.getTranslation(
          vec3.create(),
          worlds.subarray(joint * 16, joint * 16 + 16) as unknown as mat4,
        );
        expect(vec3.distance(actual, expected)).toBeLessThan(0.01);
      }
    }
  });
});
