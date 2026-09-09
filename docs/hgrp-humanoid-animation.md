# HGRP humanoid animation — plan and data contract

Most of the client's clips (3654 of 4663 requested in the 2026-09 export: all `battle`,
`customized`, `3c` locomotion, most `interact`, the per-character photo-mode pose
`interact_camera_01`) are **Unity Humanoid** clips. They do not store bone transforms for the
body; they store *muscle* values that only a solver with the character's `Avatar` turns back
into a pose. The export refuses them today. This document is the plan for supporting them in
the engine itself — the loader understands the Avatar, the animation system evaluates muscle
clips at runtime — and the contract for the data the export has to deliver. Generic clips keep
the pipeline in `hgrp-clip-format.md`; nothing there changes.

Status: 💭 design (2026-09-10). Owner notes: `.claude-learnings/animation-pipeline.md`.

## 1. What a humanoid clip is

Unity's humanoid rig maps a character's bones onto 55 canonical *human bones* (Hips, Spine,
Chest, UpperChest, Neck, Head, Left/Right UpperLeg … Toes, Shoulder … Hand, 15 finger bones per
hand, eyes, jaw). A humanoid clip keys, per frame:

| Curves | Count | Meaning |
| --- | --- | --- |
| muscles | 95 | one value in [−1, 1] per rotational degree of freedom of the human bones (`Spine Front-Back`, `Left Arm Down-Up`, `Left Thumb 1 Stretched`, …); the value scales the bone's angular limit for that axis |
| `RootT`, `RootQ` | 3 + 4 | the body's position (centre of mass) and orientation in the character's root space |
| IK goals | 4 × (3 + 4) | `LeftFootT/Q`, `RightFootT/Q`, `LeftHandT/Q`, `RightHandT/Q`: where the feet and hands are, baked from the source animation |
| TDoF | 0–9 × 3 | translation degrees of freedom of a few bones (spine, chest, neck, head, shoulders) when the Avatar has `m_HasTDoF` |
| generic | any | ordinary transform curves for bones outside the human rig: hair, cloth, twist helpers, IK markers, weapon sockets |

The body pose is reconstructed by the solver (`HumanPoseHandler` in Unity, native code):

1. each human bone's local rotation from its muscle values through the Avatar's per-bone
   **axes** — `q_local = PreQ · ZYRoll(limit(muscle) · sign) · PostQ⁻¹`, where `limit()` maps the
   signed muscle value onto the bone's min/max limit and `ZYRoll` is Unity's twist-first
   parametrisation (tan-half-angle coordinates, x = twist);
2. TDoF values added to those bones' local translations;
3. the skeleton composed with the hips at identity, its **centre of mass** taken from
   `m_HumanBoneMass`, then the hips placed so that the centre of mass and body orientation
   equal `RootT`/`RootQ` (times `m_RootX`);
4. twist bones (`m_ArmTwist`, `m_ForeArmTwist`, `m_UpperLegTwist`, `m_LegTwist`) receive their
   share of the neighbouring bone's twist;
5. optionally, IK goals correct feet and hands (not needed for a faithful first pass — the goals
   were baked *from* the pose).

Because muscles are normalised, the same clip plays on any character with an Avatar: this is
Unity's retargeting, and it is what makes humanoid clips the truly shareable ones (proportion
differences are absorbed in muscle space; only foot sliding needs the IK step).

## 2. Plan

Four phases; each has a deliverable that can be checked without the next.

| Phase | Deliverable | Check |
| --- | --- | --- |
| ① export data | `avatar.json` for one character + `clips/<clip>.humanoid.json` for three of its humanoid clips (§3), alongside the usual clip FBX for their generic curves | files validate against §3; `avatar.json` bone paths exist on the model glb |
| ② offline solver | `scripts/hgrp/humanoid.mjs`: Avatar + muscle curves → per-frame bone TRS; baked into the same clip glb format as generic clips (`hgrp-clip-format.md`) so the engine of today can already play it | the solved feet and hands land on the clip's own IK goal curves every frame (mm-level); `clip-check.mjs` passes; browser: pose matches the game's photo-mode |
| ③ engine | loader reads `avatar.json` into a `HumanoidRig`; clips ship as glb with the `HGRP_humanoid` extension (§4); `SkeletalAnimationSystem` gains a muscle → TRS stage; a character with an Avatar can play any humanoid clip in the pool | the runtime pose equals the offline bake of ②; Pelica's clip on Ardelia stands, no foot sliding worse than the generic pool's |
| ④ scale-up | every character's Avatar, every humanoid clip through the converter, the Animation panel lists them, cross-character selection | pool complete; `battle`/`customized` sets browsable |

Engine touch points for ③:

- `renderer/assets/`: `HumanoidRig` type (human bone → node index, axes, masses, root
  transform, twist weights, T-pose) and its loader; `HumanoidClip` beside `GLTFAnimation`
  (dense muscle tracks + root + goals + the generic channels).
- `ecs/systems/animation/SkeletalAnimationSystem`: `applyClip` branches on the clip kind; the
  humanoid branch writes the solved TRS into the same `translations/rotations/scales` buffers
  the generic branch fills, so composition, palettes and skinning are untouched.
- `SkeletonComponent`: the clip reference becomes kind-aware; blending, if ever, happens in
  muscle space for humanoid clips.
- `web-client/stages/hgrp/characters.ts`: the pool lists humanoid clips for every character
  that has an Avatar; a character without one only gets generic clips.

Order of work inside ②: axes math first (one arm, one clip, compare against the IK goal),
then root placement (mass centre), then twist, then fingers and TDoF. Each step has a
measurable residual against the goals.

Risks: the formulas are reconstructed from public knowledge of Mecanim, not from source — the
exact `ZYRoll` form, how limits are stored (angles vs tan-half-angles), the centre-of-mass and
body-orientation definitions, and the twist distribution all have to be pinned by the IK-goal
residual. Unity's stretch and feet-spacing corrections are left out until a case needs them.

## 3. Input contract — what the export has to deliver

### 3.1 `<actor>/avatar.json` — the character's Avatar

A faithful dump of the Unity `Avatar` asset's humanoid description with hashes resolved to
node paths. Paths follow the same rule as clips: below the prefab root, `/`-joined
(`Root/Bip001/Bip001_Pelvis`). Everything the solver reads:

```jsonc
{
  "schemaVersion": 1,
  "character": "pelica",
  "animator": "chr_0004_pelica_uimodel",      // the prefab root the paths are relative to
  "scale": 1.0,                                // m_Human.m_Scale
  "rootX": { "t": [x,y,z], "q": [x,y,z,w], "s": [x,y,z] },   // m_Human.m_RootX
  "skeleton": [                                // m_Human.m_Skeleton.m_Node + m_AxesArray + m_SkeletonPose
    { "path": "Root", "parent": -1,
      "pose": { "t": [..], "q": [..], "s": [..] },           // T-pose local TRS
      "axes": null },
    { "path": "Root/Bip001/Bip001_Pelvis", "parent": 1,
      "pose": { "t": [..], "q": [..], "s": [..] },
      "axes": { "preQ": [x,y,z,w], "postQ": [x,y,z,w], "sgn": [x,y,z,w],
                "limitMin": [x,y,z], "limitMax": [x,y,z], "length": 0.0, "type": 0 } }
  ],
  "humanBones": [                              // m_HumanBoneIndex, 55 entries in HumanBodyBones order
    { "human": "Hips", "skeleton": 1, "mass": 0.145 },        // index into "skeleton"; m_HumanBoneMass
    { "human": "LeftUpperLeg", "skeleton": 5, "mass": 0.121 }
  ],
  "leftHand":  { "bones": [ ...15 skeleton indices... ] },    // m_LeftHand.m_HandBoneIndex (null if no hand)
  "rightHand": { "bones": [ ... ] },
  "twist": { "arm": 0.5, "foreArm": 0.5, "upperLeg": 0.5, "leg": 0.5 },  // m_ArmTwist ...
  "stretch": { "arm": 0.05, "leg": 0.05 },
  "feetSpacing": 0.0,
  "hasTDoF": false
}
```

Keep the field values exactly as serialised (quaternion order x y z w, limits in the unit the
asset stores — the solver decides how to read them); `null` for anything the Avatar does not
have. If the tool can also emit the raw serialised `m_Human` block, ship it beside the
resolved form as `raw`.

### 3.2 `<actor>/clips/<clip>.humanoid.json` — the muscle part of one clip

Dense samples at the clip's own rate, one array per binding, `frames` values each:

```jsonc
{
  "schemaVersion": 1,
  "name": "A_actor_pelica_interact_camera_01",
  "sampleRate": 60,
  "frames": 121,
  "settings": {                                 // m_MuscleClipInfo — what root motion keeps
    "loopTime": false, "loopBlend": false,
    "keepOriginalOrientation": true, "keepOriginalPositionY": true, "keepOriginalPositionXZ": true,
    "heightFromFeet": false, "mirror": false, "cycleOffset": 0.0
  },
  "curves": {
    "RootT": [[x,y,z], ...],  "RootQ": [[x,y,z,w], ...],
    "LeftFootT": [...], "LeftFootQ": [...], "RightFootT": [...], "RightFootQ": [...],
    "LeftHandT": [...], "LeftHandQ": [...], "RightHandT": [...], "RightHandQ": [...],
    "muscles": { "Spine Front-Back": [v, v, ...], "Left Arm Down-Up": [...], ... },   // HumanTrait.MuscleName
    "tdof": { "Spine": [[x,y,z], ...], ... }      // present only when the clip has them
  }
}
```

Muscle keys are Unity's `HumanTrait.MuscleName` strings (95); a muscle the clip does not key
is omitted (the solver reads it as 0). Values are the clip's evaluated samples, not the raw
keyframes — sample at `sampleRate` exactly as the game would. Binary alternatives (a `.bin`
with the same layout and a JSON header) are fine if JSON gets large; 143 curves at 60 fps are
about 35 KB per second of clip as float32.

### 3.3 The generic half — the same clip FBX as today

A humanoid clip's transform curves (hair, cloth, twist helpers, IK markers, sockets) go through
the existing route: `clips/<clip>.fbx` with the character's node hierarchy and that take,
listed `ok` in `clips/manifest.json` with a new field `"humanoid": true` pointing at the
sidecar (`"muscles": "<clip>.humanoid.json"`). The converter bakes the FBX part as it does
for generic clips and packs the muscle part next to it (§4).

## 4. Engine-side clip format — what the converter writes

One `.glb` per clip, the same container as generic clips (`hgrp-clip-format.md` §1–3): the
character's node hierarchy, one `animation` with the generic channels re-based onto the glb's
joint frames — plus, on that animation, the extension

```jsonc
"extensions": {
  "HGRP_humanoid": {
    "avatar": "pelica",                       // the Avatar the muscle values were authored against
    "sampleRate": 60,
    "settings": { ...as in 3.2... },
    "root":  { "translation": 3, "rotation": 4 },            // animation.samplers indices
    "goals": { "LeftFoot": { "translation": 5, "rotation": 6 }, "RightFoot": { ... },
               "LeftHand": { ... }, "RightHand": { ... } },
    "muscles": [ { "name": "Spine Front-Back", "sampler": 7 }, ... ],   // SCALAR samplers
    "tdof":    [ { "bone": "Spine", "sampler": 102 }, ... ]             // VEC3 samplers
  }
}
```

The referenced samplers are ordinary animation samplers (`LINEAR`, one shared time accessor,
SCALAR / VEC3 / VEC4 outputs) that no channel targets; a viewer that ignores the extension
still plays the generic channels. Values stay in Unity's muscle space, untransformed — the
engine's solver applies the target character's Avatar at runtime, so the same file plays on
every character. The clip's `index.json` row gets `"humanoid": true`; `drivesBody` is true.

The Avatar reaches the engine as `assets/hgrp/<actor>/avatar.json`, copied through by the
converter after its paths are checked against the glb (every `skeleton[].path` must exist).

## 5. Semantics the engine commits to

- **Retargeting**: a humanoid clip selected on character B is solved with B's Avatar. The
  muscle values, root and goals are B-independent; `RootT` is scaled by the ratio of the two
  Avatars' `scale` (Unity's human scale) so a taller rig does not sink or float.
- **Root motion**: `settings` decides what of `RootT`/`RootQ` is applied to the hips and what
  is discarded (`keepOriginalPositionXZ` etc.), the same way the game's `Animator` does; the
  stage keeps owning the character's placement.
- **Generic channels win**: a bone keyed both by a muscle and by a generic channel takes the
  generic channel (Unity's behaviour for humanoid bones with explicit curves is the same).
- **IK goals** are carried but not applied in ③; applying them is the foot-sliding fix of a
  later phase.

## 6. Open points to settle with the first data drop

1. Are the Avatar's limits stored as degrees or as tan-half-angles (`m_Type` says which
   parametrisation)? Decides `limit()` in step 1 of §1.
2. Does the export evaluate the streamed muscle clip itself, or hand over raw keys with
   tangents? Dense samples are required; raw keys need a Unity-curve evaluator we do not want
   to own again.
3. Which characters share one Avatar (body-type rigs)? The `_common` sets suggest five body
   types; if their Avatars are identical, one `avatar.json` per body type is enough.
