# HGRP animation clips — file format and delivery

How an animation clip reaches the engine, written for whoever produces clips (an export tool,
an agent driving Unity) rather than for the renderer. The engine side is
`packages/renderer/src/assets/gltfAnimations.ts`; the current producer is
`scripts/hgrp/anim-convert.mjs`; the golden reference is
`packages/web-client/assets/hgrp/pelica/clips/A_actor_pelica_gacha_ani.glb`.

## 1. What a clip file is

One clip = one **glTF 2.0 binary (`.glb`)** containing

- the character's **node hierarchy** (names, parent/child links, rest translation / rotation /
  scale), with **no meshes, skins, materials, textures or cameras**;
- exactly **one `animation`**, named after the clip.

It is a plain glTF file: any glTF tool can open it. It carries its own node hierarchy because
glTF animation channels can only address nodes inside their own document; the engine joins the
clip onto the character model by **node path** (§3), never by index.

Placement and naming:

```
packages/web-client/assets/hgrp/<actor>/clips/<clipName>.glb
```

`<actor>` is the export's character id (`pelica`, `laevat`, `ardelia`, …), `<clipName>` the
Unity AnimationClip name (`A_actor_pelica_gacha_ani`). The web client discovers every file
matching `assets/hgrp/*/clips/*.glb` at build time; nothing has to be registered. The model glb
is never modified for a clip, and a model rebuild leaves `clips/` in place.

Every clip on the stage is one **pool**: a character lists the clips in its own folder first
(bare name; `A_actor_pelica_gacha_ani` sorts before its `_loop`), then every other character's
as `<actor>/<clipName>`. A clip baked against one rig plays on any rig through the shared
`Bip001` bone chain; bones the target rig lacks are dropped.

## 2. Animation data

| Item | Requirement |
| --- | --- |
| Channels | `translation` (VEC3, metres), `rotation` (VEC4 quaternion x y z w), `scale` (VEC3). No `weights`. |
| Interpolation | `LINEAR` or `STEP`. `CUBICSPLINE` is accepted but nothing produces it. |
| Time | Sampler input in **seconds** from 0, float32, strictly increasing. Sample at the clip's native rate (30 or 60 fps) and reduce keys if you like; the golden clip is 60 fps reduced to ~0.7 keys per channel-frame. |
| Coverage | Every driven bone gets its channels; undriven bones simply keep the rest pose stored in the clip's nodes (which must equal the model's, §3). |
| Root motion | Keep it. `Bip001` (pelvis) translation is animated; the scene root is not. |
| Count | One animation per file. A file with several is accepted (they attach as `<name>#i`) but is not the convention. |

## 3. Node hierarchy and the path rule

The engine matches a clip node to a model node by its **path below the scene root**: the node
names from the first level under the scene root down to the node, joined with `/`. The scene
root's own name is ignored, so a clip exported under another prefab name still matches.

For Pelica (`packages/web-client/assets/hgrp/pelica/pelica.glb`):

```
chr_0004_pelica_uimodel            <- scene root, not part of any path
└── Root                           path "Root"
    ├── Bip001                     path "Root/Bip001"
    │   └── Bip001_Pelvis          path "Root/Bip001/Bip001_Pelvis"
    │       └── Bip001_Spine … Bip001_L_Hand … wep_L
    ├── IK_Root / IK_Weapon_L_001 / …
    └── (mesh nodes — absent in a clip file)
```

Rules:

- Node **names must equal the model glb's** (they come from the FBX: `Bip001_L_Hand`, `wep_L`,
  `L_skirtA_01_jnt`, …). A name that does not exist on the model is dropped with a count in the
  console; a typo or a renamed socket silently loses that bone's motion.
- Include the **whole skeleton**, not only the driven bones: the engine reads the rest pose of
  undriven nodes from the clip file's nodes, and a missing node breaks the paths of everything
  below it.
- Duplicate bone names inside one rig (Pelica's weapon decos each carry a `Root` / `Root_M`)
  were renamed `Root.001` / `Root_M.001` by Blender on the model side. A clip that does not
  drive those bones need not reproduce the renaming.

## 4. Coordinate frames — the part that is easy to get wrong

The model glb was produced by Blender (FBX import → glTF export). Blender parks the Z-up → Y-up
conversion as a **+90° rotation about X on the scene root node** and leaves every node below it
in the FBX import frame. Unity's rig and this glTF also differ by a **mirror through the YZ
plane**. A clip's channel values must land in the *same node-local frames as the model glb*, or
the character folds in half.

Two ways to guarantee that:

**Route A — FBX through the engine's own converter (recommended).** Export the clip from Unity as
an FBX containing the character's skeleton and that one animation take (baked keys, no IK or
constraints left live), with the **same exporter and settings that produced the model FBX**, and
drop it at `out/<actor>/clips/<clipName>.fbx`. The engine's converter (`scripts/hgrp/`) imports
it with the same Blender step as the model — same unit handling, same axis conversion, same
node naming — strips meshes and skins, and writes the `.glb`. Frames match by construction and no
hand-written axis math is involved. Requirements for the FBX:

- one animation take per file (several are fine, they become several clip files);
- keys baked at 30 or 60 fps; no unbaked constraints, no muscle/humanoid retargeting layers;
- the full skeleton as in the model FBX; meshes may be present (they are stripped) or absent;
- units: declare metres (`UnitScaleFactor` 100 over metre geometry) — the converter cancels the
  declared unit anyway and reads one FBX unit as one metre (the 2026-09 export declared
  centimetres over metre geometry; see `scripts/hgrp/README.md`).

**Route B — glTF written directly.** Only if the tool already speaks glTF. Then the file must
reproduce the model glb's node hierarchy *and rest TRS* (copy them from the model glb, or from
the golden clip), and channel values must be expressed in those node frames. In practice that
means applying, to every Unity local TRS, the mirror `translation (x, y, z) -> (-x, y, z)`,
`rotation (x, y, z, w) -> (x, -y, -z, w)`, scale unchanged, and driving `Root` with the constant
rotation `(-0.7071, 0, 0, 0.7071)` (the inverse of the scene root's +90° X) so the Unity frame
lines up under it — exactly what the golden clip does (`Root` channels: rotation
`(-0.7071, 0, 0, 0.7071)`, translation `(0, 0, 0)`; `Bip001` first translation key
`(-0.028, 0.925, -0.811)` metres). Validate against the golden clip (§5) before trusting it.

## 5. Validation

```bash
node scripts/hgrp/clip-check.mjs packages/web-client/assets/hgrp/pelica/pelica.glb \
     packages/web-client/assets/hgrp/pelica/clips/A_actor_pelica_gacha_ani.glb
```

The check applies the engine's join rule and fails a clip whose file carries meshes or skins,
holds no animation, drives nodes the model does not have (beyond what a foreign rig legitimately
lacks), or whose evaluated pose is not a standing character — at t = 0 the pelvis (`Bip001`)
must be 0.6–1.3 m above the ground and the head above the pelvis, which catches a wrong axis or
mirror at once. A clean report on the golden clip reads
`450 nodes, 0 meshes, 1 animation, 704 channels, 704 matched, 0 dropped`.

In the browser, the character's **Animation** folder lists the clip; the pelvis stays at hip
height, feet on the ground, hands where the game puts them.
