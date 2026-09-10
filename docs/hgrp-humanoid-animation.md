# HGRP humanoid animation — how muscle clips become poses

Most of the client's clips (3654 of 4663 requested in the 2026-09 export: all `battle`,
`customized`, `3c` locomotion, most `interact`, the per-character photo-mode pose
`interact_camera_01`) are **Unity Humanoid** clips. They do not store bone transforms for the
body; they store *muscle* values that only a solver with the character's `Avatar` turns back
into a pose. This document is the reconstruction of that solver, the contract for the data the
export delivers, and how the clips reach the engine. Generic clips keep the pipeline in
`hgrp-clip-format.md`; nothing there changes.

Status (2026-09-10): the solver is implemented and validated
(`packages/renderer/src/assets/humanoid/humanoid.ts`), and the converter bakes humanoid clips
into the plain clip glb format so the engine of today plays them (phase ② below, done for
yvonne). Runtime solving in the engine (phase ③) is next. Owner notes:
`.claude-learnings/animation-pipeline.md`.

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
   transform** computed: position = the Avatar's T-pose body position plus the displacement of
   the mass centre from the T-pose, the mass centre taking each human bone's mass at the
   midpoint of its axis (`length` along the muscle frame's x); orientation = up from the
   midpoint of the two upper-leg joints to the midpoint of the two upper-arm joints, left-right
   from the sum of the right-minus-left upper-leg and upper-arm vectors. The hips are then moved
   so that this body transform equals the clip's `RootT · scale`, `RootQ`.
3. **Secondary bones** come from the clip FBX exactly as for a generic clip, composed under the
   solved body.
4. **IK goals** are carried, not applied: a hand goal is the hand joint, a foot goal the sole
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

On yvonne's 48 clips (2026-09-10): 33 clips read ≤ 0.1 mm fitted on every frame; the rest
(the `*_additive` loops, `battle_hit_whack_*`, `battle_skill_ult`, a few frames of the
`attack` and `ult` clips) sit millimetres to centimetres off on every frame or in a burst,
which is the source data — goals baked on another rig, or IK targets that leave the pose
during a jump. Unity shows the muscle pose for those as well; the goals only feed IK.
Absolute residuals are 3–10 mm: the body-position rule above is exact for long bones and
approximate for the torso and leaves (§6).

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
_common/<bodyType>/…                    the same for the shared sets
```

Everything is in Unity's space, verbatim, **except the FBX, whose world is Unity's mirrored in
x** (the export's handedness conversion; the model FBX and glb share it). The converter maps the
solved pose into the FBX's frames through the model FBX's node defaults, which are the prefab's
T-pose in FBX frames (a clip FBX's own defaults are the A-pose the meshes were bound in).

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

**Known defect — the muscle keys are misnamed** (2026-09-10). The clip's tracks run: body
muscles (21), left leg (8), LeftUpperLeg TDoF (3), right leg (8), RightUpperLeg TDoF (3), left
arm (9), right arm (9). The exporter names track *i* with the *i*-th entry of the dense
143-slot table (`HumanTrait.MuscleName` order followed by TDoF), so from the right leg on the
names are shifted by three, from the left arm by six, and the right arm lands under
`LeftHand.Thumb.*` / `LeftHand.Index.*`. Every value is present. The converter reads the slots
back by position (`EXPORT_SLOT_MEANING` in `scripts/hgrp/humanoid.mjs`); the fix belongs in
the exporter — name tracks from the clip's own `m_ClipBindingConstant` — after which that table
goes. The `t_pose` clip is the A-pose the meshes were bound in, not a T-pose.

## 4. Engine-side format

**Today (phase ②):** a humanoid clip becomes the same clip glb as a generic one
(`hgrp-clip-format.md`): the node hierarchy plus one animation, the 24 human bones' channels
written from the solver, the secondary bones' from the FBX, on the sidecar's frame grid. The
folder's `clips/index.json` row carries `"humanoid": true`; `drivesBody` is true. The Avatar is
copied to `assets/hgrp/<actor>/avatar.json` after every `skeleton[].path` is checked to exist
on the model glb. A viewer, and the engine's `SkeletalAnimationSystem`, need nothing new.

**Planned (phase ③):** the muscle curves ship in the glb instead of the solved body, as an
extension on the animation, and the engine solves against the target character's Avatar at
runtime — the same file then plays on every character:

```jsonc
"extensions": {
  "HGRP_humanoid": {
    "avatar": "yvonne",                       // the Avatar the muscle values were authored against
    "sampleRate": 60,
    "settings": { ...as in 3.2... },
    "root":  { "translation": 3, "rotation": 4 },            // animation.samplers indices
    "goals": { "LeftFoot": { "translation": 5, "rotation": 6 }, "RightFoot": { ... },
               "LeftHand": { ... }, "RightHand": { ... } },
    "muscles": [ { "name": "Spine Front-Back", "sampler": 7 }, ... ]    // SCALAR samplers
  }
}
```

The referenced samplers are ordinary animation samplers no channel targets; a viewer that
ignores the extension still plays the secondary channels. Engine touch points: `HumanoidRig`
loaded from `avatar.json` beside the model (its `preQ`/`postQ` re-based into the glb's joint
frames by the converter, so the runtime solve writes glb-frame TRS directly), a `HumanoidClip`
beside `GLTFAnimation`, and a muscle → TRS stage in `SkeletalAnimationSystem.applyClip` that
fills the same translation/rotation buffers the generic path fills.

## 5. Semantics

- **Units and frames.** Muscles are unit-free. `RootT` and the goal translations are in the
  Avatar's normalized units: multiply by `scale` for metres. The solved pose is in the prefab
  root's space; the converter mirrors it into the export's FBX space (x negated, rotations
  conjugated by the mirror, plus a per-bone frame change read off the T-pose).
- **Retargeting**: a humanoid clip selected on character B is solved with B's Avatar; the
  muscle values, root and goals are B-independent and `RootT · scale_B` places B's body.
- **Root motion**: the body transform is applied absolutely — a clip that travels moves the
  character across the stage and snaps back on loop, like a generic clip whose `Bip001`
  translates. `settings` and `MotionT/Q` are carried in the sidecar for a later root-motion
  mode; nothing reads them yet.
- **Generic channels win**: a bone keyed both by a muscle and by a generic channel takes the
  generic channel (none of the export's clips does this; the FBX never keys the human bones).
- **IK goals** are carried but not applied.

## 6. Open points

1. **The exact body-position rule.** Mass at each bone's axis midpoint, expressed as a
   displacement from the T-pose, reproduces the stored body position to 2.3 mm mean / 7.7 mm
   max over 1590 frames; the long limbs fit a midpoint exactly, the torso chain and the leaves
   do not resolve from the data. It shifts the whole character by that much; the goals are the
   measurement to refine against.
2. **Root motion**: applying `settings` (`keepOriginalPositionXZ` etc.) the way the game's
   Animator does, so looping locomotion stays in place.
3. **Exporter naming** (§3.2): fix at the source, then delete the slot table.
4. **Other characters and the `_common` sets**: the converter handles any folder with an
   `avatar.json`; only yvonne has been run and checked.
