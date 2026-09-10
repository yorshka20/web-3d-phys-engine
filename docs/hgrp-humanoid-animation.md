# HGRP humanoid animation — how muscle clips become poses

Most of the client's clips (3654 of 4663 requested in the 2026-09 export: all `battle`,
`customized`, `3c` locomotion, most `interact`, the per-character photo-mode pose
`interact_camera_01`) are **Unity Humanoid** clips. They do not store bone transforms for the
body; they store *muscle* values that only a solver with the character's `Avatar` turns back
into a pose. This document is the reconstruction of that solver, the contract for the data the
export delivers, and how the clips reach the engine. Generic clips keep the pipeline in
`hgrp-clip-format.md`; nothing there changes.

Status (2026-09-10): the solver is implemented and validated
(`packages/renderer/src/assets/humanoid/humanoid.ts`), the converter ships the muscle curves in
the clip glb with the character's Avatar binding beside the model, and the engine solves them
at play time against whichever character plays the clip (§4) — run over the whole roster and
the shared sets. Owner notes: `.claude-learnings/animation-pipeline.md`.

## 1. What a humanoid clip is, and how a pose is solved

Unity's humanoid rig maps a character's bones onto 25 canonical *human bones* (Hips, the spine
chain, neck, head, shoulders, arms, hands, legs, feet, toes, eyes, jaw; finger bones are a
separate table no Avatar of this project fills). A humanoid clip keys, per frame:

| Curves | Count | Meaning |
| --- | --- | --- |
| muscles | 55 | one value per rotational degree of freedom of the human bones (`Spine Front-Back`, `Left Arm Down-Up`, …), nominally in [−1, 1]; the value scales the bone's angular limit for that axis |
| `RootT`, `RootQ` | 3 + 4 | the **body transform**: mass centre and body orientation in the prefab root's space, translation divided by the Avatar's human scale |
| IK goals | 4 × (3 + 4) | `LeftFootT/Q`, `RightFootT/Q`, `LeftHandT/Q`, `RightHandT/Q`, relative to the body transform, translation divided by the same scale |
| `MotionT/Q` | 3 + 4 | the root motion Unity derives from the body transform per the clip's settings |
| TDoF | 3 per bone | translation degrees of freedom; the export's clips carry them for the upper legs, the Avatars have `hasTDoF` false and ignore them |
| generic | any | ordinary transform curves for bones outside the human rig: hair, cloth, twist helpers, IK markers, weapon sockets — the clip FBX |
| Animator parameters | 0–10 | float curves the game's scripts read, keyed by `CRC32(name)` in the sidecar's `otherCurves`: `WeaponHide` (2765131272; 1 in the `blown_start`, `interact_touch_*`, `interact_bomb_start`, `interact_nefarp2_grab` clips — the game hides the weapon per clip through it), `RootMotionWeight` (345227111), `FootIKWeight` (729379380), `ClothRightLeft` (1624416957); the rest are unnamed |

The solver, every formula pinned against the export's data (§2):

1. **Muscle → local rotation.** Each human bone has axes `preQ`, `postQ`, `sgn`, `limitMin`,
   `limitMax` (radians) and `length`. Its three muscle values (x = twist along the bone, y and z
   the swings; `BONE_MUSCLES` in the module says which muscle drives which axis) become

   ```
   angle_i = sgn_i · (m_i > 0 ? m_i · limitMax_i : −m_i · limitMin_i)
   swing   = normalize( tan(angle_x/2),
                        tan(angle_y/2) + tan(angle_x/2)·tan(angle_z/2),
                        tan(angle_z/2) − tan(angle_x/2)·tan(angle_y/2),  1 )      # Mecanim's ZYRoll chart
   local   = preQ · swing · postQ⁻¹
   ```

   Muscle zero is **not** the T-pose for every bone: Unity centres knees and elbows in their
   bend range (the T-pose knee reads `Lower Leg Stretch = +1`, the elbow `Forearm Stretch = +1`),
   thighs at `Front-Back = +0.6`, upper arms at `Down-Up = 0.4, Front-Back = 0.3`. The spine
   chain, clavicles, hands, feet and toes have their zero at the T-pose (`preQ · postQ⁻¹`
   equals the stored T-pose rotation).
2. **Hips.** With the hips at their T-pose transform, the skeleton is composed and its **body
   transform** computed, both parts measured from the T-pose: position = the Avatar's T-pose
   body position (`rootX`) plus the displacement of the mass centre from the T-pose, the mass
   centre taking each human bone's mass at the midpoint of its axis (`length` along the muscle
   frame's x); rotation = the pose's orientation frame with the T-pose's frame undone in body
   space, `frame(pose) · frame(tPose)⁻¹`, so the T-pose reads as identity. The frame: up from
   the midpoint of the two upper-leg joints to the midpoint of the two upper-arm joints,
   left-right from the sum of the right-minus-left upper-leg and upper-arm vectors. Its T-pose
   value is what the Avatar stores as `rootX`'s rotation — a tilt about x that is a property of
   the skeleton (0.08° on the girl rigs, 1–1.8° on the men, 2.2° loli, 3° lifeng). The hips are
   then moved so that this body transform equals the clip's `RootT · scale`, `RootQ`.
3. **Writing the pose.** What Unity's Animator writes onto the character's own hierarchy is the
   hips' transform and the human bones' local rotations; every other local transform — the
   human bones' translations, the nodes between them such as `Bip001_Pelvis` — stays the
   prefab's. The solve runs on the Avatar's skeleton (the body transform and the goals are
   defined on it) and is written that way.
4. **Secondary bones** come from the clip FBX exactly as for a generic clip, composed under the
   solved body.
5. **IK goals** are carried, not applied: a hand goal is the hand joint, a foot goal the sole
   (ankle moved one foot `length` along the foot axis, which the Avatar points at the ground),
   both in the body transform's frame; a goal's rotation is the end bone's muscle frame (bone
   rotation · `postQ`).

Because muscles are normalised, the same clip plays on any character with an Avatar: this is
Unity's retargeting, and it is what makes humanoid clips the truly shareable ones (proportion
differences are absorbed in muscle space; only foot sliding needs the IK step).

## 2. Validation

Every humanoid clip carries its own ground truth: the four IK goals were baked from the source
pose. `scripts/hgrp/humanoid-check.mjs <humanoid-root>/<actor>` solves every clip and reports,
per clip, the largest distance between the solved hands and feet and the stored goals — after
the best rigid fit (the muscle solve alone) and absolute (hips placed by the body transform).

On yvonne's 48 clips 33, on pelica's 151 clips 144, on typhoea's 203 clips 186, read ≤ 0.1 mm
fitted on every frame (2026-09-10); the rest (the `*_additive` loops, `battle_hit_whack_*`,
`battle_skill_ult`, a few frames of the `attack` and `ult` clips) sit millimetres to
centimetres off on every frame or in a burst, which is the source data — goals baked on another
rig, or IK targets that leave the pose during a jump. Unity shows the muscle pose for those as
well; the goals only feed IK. Absolute residuals on the clean clips are 2–11 mm (typically
3–4 mm mean): the body-position rule above is exact for long bones and approximate for the
torso and leaves (§6).

The rotation half of the body transform was pinned by the fit itself: with the T-pose frame
left in, the fitted rotation of every clean clip is a constant angle equal to the rig's
`rootX` tilt, about the **body's** x axis whatever way the body faces (2.16° on typhoea, 3.05°
on lifeng, 0.08° on yvonne — which is why the girl rigs alone did not show it). Undoing the tilt
in world space instead leaves 13 mm; in body space, 6 mm.

Two more checks are independent of the goals: the T-pose clip's muscles equal the model's
bind pose (the FBX skin clusters) inverted through step 1, and the FBX IK markers
(`IK_Hand_*_001`) coincide with the hand goals to 0.1 mm.

## 3. Input contract — what the export delivers

The extraction tool writes a separate tree, `out_humanoid/`, mirroring `out/`:

```
<actor>/avatar.json                     the Avatar's m_Human, values verbatim
<actor>/clips/<clip>.humanoid.json      the clip's muscle curves, dense per frame
<actor>/clips/<clip>.fbx                the same clip's secondary bones (hair, cloth, IK, sockets)
<actor>/clips/manifest.json             one row per clip: clipKind "Humanoid", humanoid: true, humanoidFile
_common/<bodyType>/…                    the same for the shared sets — no avatar.json: their
                                        clips are solved against the Avatar of the actor the
                                        manifest's `animator` names (boy → antal, gentleman →
                                        deepfin, girl → aglina, lady → aurora, littleboy →
                                        lifeng, loli → typhoea, panda → dapan)
```

Everything is in Unity's space, verbatim, **except the FBX, whose world is Unity's mirrored in
x** (the export's handedness conversion; the model FBX and glb share it). The FBX node frames
are exactly the mirrored Unity frames — nothing else differs per node — so the converter mirrors
the solved pose and nothing more. It checks that per character against the model FBX's node
defaults, the prefab's T-pose: every node's rotation must equal the Avatar's T-pose once
mirrored (within 0.05°; all 33 characters do). The joint offsets need not, and on the prefab
they differ from the Avatar's skeleton at the hips (2–29 mm) and at `Bip001_Pelvis` (0.2–3 mm,
half the roster) — the Avatar's skeleton pose is Unity's, the prefab's is the model's. The
converter reports the differences and uses the prefab's offsets, as Unity would (§1 step 3);
the hips are placed by the clip's root anyway. A clip FBX's own defaults are the A-pose the
meshes were bound in, not a T-pose.

A clip only carries the curves it animates (the `lookat_body_*` clips drop the root, both foot
goals and every leg curve). A curve the clip does not key takes the character's **default
pose** — the model's bind pose expressed in muscle space, and its body transform for the root —
which is what Unity's Animator does with the pose the character started in.

### 3.1 `avatar.json`

| field | meaning |
| --- | --- |
| `name` | the Avatar asset (`SK_actor_<actor>_01Avatar`) |
| `skeleton[]` | the human skeleton: `index`, `path` (below the prefab root, `Root/Bip001/Bip001_Pelvis`), `parent`, `tPose` (10 floats: t xyz, q xyzw, s xyz), `axes` (`preQ`, `postQ`, `sgn`, `limitMin`, `limitMax` in radians, `length`, `type` — 1 = ZYRoll, the only type that occurs) or `null` |
| `humanBones[]` | 25 entries in Mecanim's internal bone order (Hips, LeftUpperLeg, RightUpperLeg, LeftLowerLeg, RightLowerLeg, LeftFoot, RightFoot, Spine, Chest, UpperChest, Neck, Head, LeftShoulder, RightShoulder, LeftUpperArm, RightUpperArm, LeftLowerArm, RightLowerArm, LeftHand, RightHand, LeftToes, RightToes, LeftEye, RightEye, Jaw — not `HumanBodyBones` order): `humanBone`, `skeletonIndex` (−1 when the rig lacks the bone), `path`, `mass` |
| `rootX`, `scale` | the T-pose body transform (10 floats) and the human scale; `scale` equals `rootX`'s y |
| `leftHandBoneIndex`, `rightHandBoneIndex`, `hasLeftHand`, `hasRightHand` | finger tables — all −1 / false in this project |
| `armTwist`, `foreArmTwist`, `upperLegTwist`, `legTwist`, `armStretch`, `legStretch`, `feetSpacing`, `hasTDoF` | twist distribution and IK settings, unused by the solver so far |

All 33 Avatars have 24 skeleton nodes and one of two path sets; `scale` and `rootX` are shared
by body type (the `girl` rigs all read 0.9917).

### 3.2 `<clip>.humanoid.json`

`name`, `sampleRate`, `frameCount`, `startTime`, `stopTime`, `curves` (Unity attribute name →
`frameCount` floats, dense), `otherCurves` (game float parameters by hash), `settings`
(`ClipMuscleConstant`: `loopTime`, `keepOriginalPositionY`, …). Curve keys: `MotionT/Q.*`,
`RootT/Q.*`, `<Goal>T/Q.*`, the 95 `HumanTrait.MuscleName` strings, `SpineTDOF.*`,
`ChestTDOF.*`.

`curveIndex` gives each curve's index in the clip's own humanoid index space (Motion 0–6, Root
7–13, goals 14–41, body muscles 42–62, left leg 63–70, LeftUpperLeg TDoF 71–73, right leg
74–81, RightUpperLeg TDoF 82–84, left arm 85–93, right arm 94–102, fingers 103–142). The
converter asserts the indices of every curve it reads and refuses a sidecar without the field:
the batch exported before 2026-09-10 numbered the muscles straight through and had every name
from the right leg on wrong. The `t_pose` clip is the A-pose the meshes were bound in, not a
T-pose.

## 4. Engine-side format

A humanoid clip becomes the same clip glb as a generic one (`hgrp-clip-format.md`): the node
hierarchy plus one animation whose channels are the secondary bones' from the FBX, on the
sidecar's frame grid. The body is **not** baked. Its curves ship in the same animation as
samplers no channel targets — the muscles as SCALAR, root and goal translations as VEC3 and
rotations as VEC4, the Animator parameters as SCALAR, keys reduced like the channels — named
from the animation's `extras.HGRP_humanoid` by sampler index:

```jsonc
"extras": {
  "HGRP_humanoid": {
    "avatar": "SK_actor_yvonne_01Avatar",    // the Avatar the muscle values were authored against
    "sampleRate": 60,
    "settings": { ...as in 3.2... },
    "root":  { "translation": 3, "rotation": 4 },            // absent when the clip has no root curves
    "goals": { "LeftFoot": { "translation": 5, "rotation": 6 }, "RightFoot": { ... },
               "LeftHand": { ... }, "RightHand": { ... } },   // the goals the clip keys
    "muscles": { "Spine Front-Back": 7, "Spine Left-Right": 8, ... },   // the muscles the clip keys
    "parameters": [ { "name": "WeaponHide", "hash": 2765131272, "sampler": 62 }, { "hash": 3423551091, "sampler": 63 } ]
  }
}
```

Root and goal translations stay in the clip's normalized units (§5). A viewer that ignores the
extras plays the secondary channels; the engine solves the body against the character the clip
plays on, so one file plays on every character with an Avatar. `clips/index.json` marks the row
`"humanoid": true`, `drivesBody` true. The secondary bones are baked with the undriven body held
at the model's bind pose (`hgrp-clip-format.md`), which is the pose the glb composes an
undriven joint to — so their locals are right under whatever the solver puts the body at.

Beside the model the converter writes the Avatar verbatim (`avatar.json`) and its **binding**
to the glb, `avatar.binding.json` — what a pose solved on the Avatar's skeleton in Unity space
needs to land in the glb's joints:

```jsonc
{
  "avatar": "SK_actor_yvonne_01Avatar",
  "nodes": [                                   // skeleton[] order
    { "path": "Root/Bip001",
      "frame": { "rotation": [x, y, z, w], "translation": [x, y, z] },   // FBX joint frame → glb bone frame: bind⁻¹ · rest
      "local": { "rotation": [x, y, z, w], "translation": [x, y, z] } }, // the prefab's local transform, Unity space
    ...
  ],
  "defaults": { "muscles": [55 values], "root": { "translation": [3], "rotation": [4] } }   // the bind pose in muscle space
}
```

`frame` is the fixed per-joint change the generic bake applies to every driven joint (the
Blender bone re-orientation); with the export's mirror in x it takes a joint's Unity-space local
transform to the glb's: `glbLocal = frame(parent)⁻¹ · mirror(unityLocal) · frame(joint)`.
`local` is what Unity's Animator leaves untouched — the translations of the human bones and the
whole transform of a node no muscle drives (`Bip001_Pelvis`); `defaults` fills the curves a
clip lacks.

Engine touch points (`packages/renderer/src/assets/humanoid/`): `humanoid.ts` the solver,
`clip.ts` the `GLTFHumanoidClip` read from the extras (`GLTFAnimation.humanoid`) and its
sampling, `binding.ts` the `HumanoidModelBinding` (`attachHumanoidRig` hangs it on
`GLTFModel.humanoid`) and `poseHumanoidClip`, which samples, solves and writes the glb-local
TRS into the skeleton buffers. `SkeletalAnimationSystem.applyClip` runs it before the clip's
channels, so the secondary bones compose under the solved body and a bone keyed both ways
takes the channel; a humanoid clip on a model without a binding moves only its secondary bones
(warned once). The sampled Animator parameters land in `SkeletonComponent.parameters`; the
HGRP stage's `HGRPWeaponHideSystem` hides the weapon meshes (`S_wpn_*`) while `WeaponHide`
reads ≥ 0.5, on top of the user's own switch. The web-client fetches `avatar.json` and
`avatar.binding.json` with the model (`stages/hgrp/characters.ts`).

Validation of the whole chain, offline: `renderer/src/assets/humanoid/__tests__/binding.test.ts`
loads a converted character (yvonne, or the folder `HGRP_HUMANOID_ASSETS` names), plays its
`interact_camera_01` through the runtime path and checks the solved hands against the clip's
own goals in the glb's world (< 10 mm); against the previous offline bake of the same clips the
runtime pose agrees to 0.0 mm on frame times and 1–4 mm between them (key reduction).

## 5. Semantics

- **Units and frames.** Muscles are unit-free. `RootT` and the goal translations are in the
  Avatar's normalized units: multiply by `scale` for metres. The solved pose is in the prefab
  root's space; the converter mirrors it into the export's FBX space (x negated, rotations
  conjugated by the mirror).
- **Retargeting**: a humanoid clip selected on character B is solved with B's Avatar and
  written through B's binding; the muscle values, root and goals are B-independent and
  `RootT · scale_B` places B's body. B's own bind pose supplies the curves the clip lacks.
- **Root motion**: the body transform is applied absolutely — a clip that travels moves the
  character across the stage and snaps back on loop, like a generic clip whose `Bip001`
  translates. `settings` and `MotionT/Q` are carried in the sidecar for a later root-motion
  mode; nothing reads them yet.
- **Generic channels win**: a bone keyed both by a muscle and by a generic channel takes the
  generic channel (none of the export's clips does this; the FBX never keys the human bones).
- **IK goals** are carried but not applied.
- **Animator parameters** are sampled per frame into `SkeletonComponent.parameters` by name;
  one the clip does not carry is absent, so a clip without `WeaponHide` leaves the weapon shown.
  `WeaponHide ≥ 0.5` hides the weapon meshes; the other named parameters
  (`RootMotionWeight`, `FootIKWeight`, `ClothRightLeft`) are carried, not acted on.

## 6. Open points

1. **The exact body-position rule.** Mass at each bone's axis midpoint, expressed as a
   displacement from the T-pose, reproduces the stored body position to 2–4 mm mean on the
   clean clips, 11 mm worst on typhoea and 29 mm on one burst of antal's `battle_combo_skill`;
   the long limbs fit a midpoint exactly, the torso chain and the leaves do not resolve from the
   data. It shifts the whole character by that much; the goals are the measurement to refine
   against.
2. **Root motion**: applying `settings` (`keepOriginalPositionXZ` etc.) the way the game's
   Animator does, so looping locomotion stays in place.
