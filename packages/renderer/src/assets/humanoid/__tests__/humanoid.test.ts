import { quat, vec3 } from 'gl-matrix';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bodyOrientation,
  bodyTransform,
  composeRigWorld,
  createHumanoidPose,
  goalPosition,
  HUMAN_BONES,
  HumanoidAxes,
  limitProject,
  musclesFromRotation,
  parseAvatar,
  rotationFromMuscles,
  setTPose,
  zyRollToQuat,
} from '../humanoid';

const deg = (d: number) => (d * Math.PI) / 180;

// Identity frames, symmetric limits: the muscle value is a fraction of the axis' limit
const plainAxes: HumanoidAxes = {
  preQ: quat.create(),
  postQ: quat.create(),
  sgn: vec3.fromValues(1, 1, 1),
  limitMin: vec3.fromValues(-deg(90), -deg(60), -deg(40)),
  limitMax: vec3.fromValues(deg(90), deg(100), deg(50)),
  length: 0.3,
};

describe('muscle space', () => {
  it('projects a muscle value onto the max side when positive and the min side when negative', () => {
    expect(limitProject(plainAxes, 0.5, 1)).toBeCloseTo(deg(50));
    expect(limitProject(plainAxes, -0.5, 1)).toBeCloseTo(-deg(30));
    expect(limitProject(plainAxes, 0, 2)).toBe(0);
  });

  it('turns single-axis ZYRoll coordinates into exact single-axis rotations', () => {
    const q = quat.create();
    for (const [axis, unit] of [
      [0, [1, 0, 0]],
      [1, [0, 1, 0]],
      [2, [0, 0, 1]],
    ] as const) {
      const v = vec3.create();
      v[axis] = Math.tan(deg(35) / 2);
      zyRollToQuat(q, v);
      const expected = quat.setAxisAngle(quat.create(), unit as unknown as vec3, deg(35));
      expect(Math.abs(quat.dot(q, expected))).toBeCloseTo(1, 6);
    }
  });

  it('rotates a bone by the limit-scaled angle about its axis, sign applied to the angle', () => {
    const q = rotationFromMuscles(quat.create(), plainAxes, vec3.fromValues(0, 0, 0.5));
    expect(Math.abs(quat.dot(q, quat.setAxisAngle(quat.create(), [0, 0, 1], deg(25))))).toBeCloseTo(
      1,
      6,
    );
    const mirroredAxes = { ...plainAxes, sgn: vec3.fromValues(1, 1, -1) };
    const m = rotationFromMuscles(quat.create(), mirroredAxes, vec3.fromValues(0, 0, 0.5));
    expect(
      Math.abs(quat.dot(m, quat.setAxisAngle(quat.create(), [0, 0, 1], -deg(25)))),
    ).toBeCloseTo(1, 6);
  });

  it('reads muscles back from a rotation it produced, whatever the frames and signs', () => {
    const axes: HumanoidAxes = {
      ...plainAxes,
      preQ: quat.setAxisAngle(quat.create(), [0.3, 0.8, -0.5], deg(130)),
      postQ: quat.setAxisAngle(quat.create(), [-0.6, 0.2, 0.7], deg(-75)),
      sgn: vec3.fromValues(-1, 1, -1),
    };
    quat.normalize(axes.preQ, axes.preQ);
    quat.normalize(axes.postQ, axes.postQ);
    for (const muscles of [
      [0.3, -0.7, 0.55],
      [-0.9, 0.2, -0.1],
      [1.3, 0.6, -0.8],
    ]) {
      const q = rotationFromMuscles(
        quat.create(),
        axes,
        vec3.fromValues(...(muscles as [number, number, number])),
      );
      const back = musclesFromRotation(vec3.create(), axes, q);
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(muscles[i], 6);
    }
  });

  it('wraps the swing in the pre/post frames: zero muscles give preQ · postQ⁻¹', () => {
    const preQ = quat.setAxisAngle(quat.create(), [0, 1, 0], deg(70));
    const postQ = quat.setAxisAngle(quat.create(), [1, 0, 0], deg(-20));
    const axes = { ...plainAxes, preQ, postQ };
    const q = rotationFromMuscles(quat.create(), axes, vec3.fromValues(0, 0, 0));
    const expected = quat.multiply(quat.create(), preQ, quat.conjugate(quat.create(), postQ));
    expect(Math.abs(quat.dot(q, expected))).toBeCloseTo(1, 6);
  });
});

// The converted yvonne Avatar, when the machine-local assets are present (scripts/hgrp/convert.mjs
// with --humanoid-src copies it beside the model).
const avatarPath = resolve(__dirname, '../../../../../web-client/assets/hgrp/yvonne/avatar.json');
describe.skipIf(!existsSync(avatarPath))('yvonne avatar', () => {
  const rig = parseAvatar(JSON.parse(readFileSync(avatarPath, 'utf8')));

  it('has every human bone but eyes and jaw, and unit masses', () => {
    const missing = HUMAN_BONES.filter((_, i) => rig.bones[i] < 0);
    expect(missing).toEqual(['LeftEye', 'RightEye', 'Jaw']);
    expect(rig.masses.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('reads the T-pose as the stored root position with identity rotation', () => {
    const pose = setTPose(rig, createHumanoidPose(rig));
    const worlds = composeRigWorld(rig, pose, new Float64Array(rig.nodes.length * 16));
    const t = vec3.create();
    const q = quat.create();
    bodyTransform(t, q, rig, worlds);
    expect(vec3.distance(t, rig.rootTranslation)).toBeLessThan(1e-6);
    expect(Math.abs(q[3])).toBeGreaterThan(Math.cos(deg(0.005)));
  });

  it("stores the T-pose's orientation frame as rootX", () => {
    const pose = setTPose(rig, createHumanoidPose(rig));
    const worlds = composeRigWorld(rig, pose, new Float64Array(rig.nodes.length * 16));
    const frame = bodyOrientation(quat.create(), rig, worlds);
    expect(Math.abs(quat.dot(frame, rig.rootRotation))).toBeGreaterThan(Math.cos(deg(0.05)));
  });

  it('puts the T-pose hands at arm length and the foot goals on the ground', () => {
    const pose = setTPose(rig, createHumanoidPose(rig));
    const worlds = composeRigWorld(rig, pose, new Float64Array(rig.nodes.length * 16));
    const leftHand = goalPosition(vec3.create(), rig, worlds, 'LeftHand');
    const rightHand = goalPosition(vec3.create(), rig, worlds, 'RightHand');
    const leftFoot = goalPosition(vec3.create(), rig, worlds, 'LeftFoot');
    expect(leftHand[0]).toBeCloseTo(-rightHand[0], 4);
    expect(leftHand[1]).toBeCloseTo(rightHand[1], 4);
    expect(Math.abs(leftHand[0])).toBeGreaterThan(0.5);
    expect(Math.abs(leftFoot[1])).toBeLessThan(1e-3);
  });
});
