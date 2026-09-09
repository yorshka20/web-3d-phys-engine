# HGRP offline asset conversion

Converts the character export (AnimeStudio CLI over the client data) into engine-consumable
assets. This is deliberately thin glue over third-party tools (Blender, gltf-transform) — asset
processing is not an engine concern; the engine only ever reads the outputs.

## Prerequisites

- **Blender** on `PATH` (`brew install --cask blender`; tested with 5.2.1 LTS).
  Override the binary with `BLENDER_BIN=/path/to/blender` if needed.
- A local export laid out as below. Its location is machine-local and always passed as an
  argument — never hardcoded.

```
<export-root>/
  <actor>/
    <actor>_uimodel.fbx    the Character Info display model: LOD0 only, materials 1:1 with
                           preset.json, the model the artists tuned materials and lights on — used
    <actor>_postmodel.fbx  the in-world model with its LOD chain; the only model of a few actors
    preset.json            the material set in the engine's schema (material ground truth)
    lighting.json          the Character Info light rig (copied through, not consumed yet)
    textures/*.png         every texture the materials reference (real PNGs)
    clips/<clip>.fbx       one animation clip each: the character's node hierarchy and one
                           take, no meshes
    clips/manifest.json    every clip requested from the client and what became of it
                           (`animator` = the prefab root the clips were baked on)
    raw/                   the Unity objects behind the above, for reference
  _common/<bodyType>/clips/     clip sets shared by body type, baked on one actor's rig
  _global/renderpipeline.json   the HGRP volume / pipeline settings (copied through)
```

## Usage

```bash
node scripts/hgrp/convert.mjs --src <export-root>                    # every actor + _common
node scripts/hgrp/convert.mjs --src <export-root> --chars ardelia,laevat
# optional: --out <dir>     (default: packages/web-client/assets/hgrp)
#           --preset-only   (rewrite preset.json + fur layers only; no Blender, no textures)
#           --clips-only    (rebake the clips only, against the converted models)
```

Re-running is safe: a full run rebuilds the actor's output folder from scratch. A character
takes about a minute (Blender), its 30-odd clips about 15 s more.

## What the pipeline does, per actor

1. **`convert-fbx.py`** (run headless by the driver): imports `<actor>_uimodel.fbx`
   (`<actor>_postmodel.fbx` when there is no uimodel) **as metres whatever the header says** —
   the script reads the FBX `UnitScaleFactor` and cancels it through `global_scale`, because the
   geometry is metre-scale in every rip while the declaration is not (100 in the first rip, 1 =
   centimetres in the 2026-09 export, which read as declared made every character a hundredth
   its size; `verifyGlb` now fails a model whose height is not a character's or whose scene
   root is scaled) — then deletes `_lod1..9` / `_shadowProxy*`
   meshes (lod0 is the only level the engine consumes), bakes the **position-averaged normal**
   of every kept mesh into `COLOR_0` (xyz * 0.5 + 0.5 — the `_OutlineAverageNormal` the HGRP
   inverted-hull outline extrudes along, so the hull stays closed across hard edges and UV
   seams; only same-facing normals are averaged so double-sided cards keep both sides), records
   which Unity UV channels the mesh carries (its layer names, `UV0`/`UV1`/`UV2`, as the mesh
   extra `hgrpUvSets`), and exports a GLB with tangents, skins, and morph targets enabled. The
   bake is written in glTF axes: the exporter converts positions/normals Z-up → Y-up but leaves
   color attributes as they are. **UV slots** (`convert.mjs slotUvSets`): the exporter numbers
   UV sets by position, so a mesh with `UV0 + UV2` (most of them) would come out as
   `TEXCOORD_0/1`; each set is moved back to `TEXCOORD_<channel>` — `TEXCOORD_1` is Unity's
   `uv2` (the fur layer fraction, the VFX mask's second UV set), `TEXCOORD_2` Unity's `uv3` —
   and a channel the mesh lacks stays absent, which the loader reads as zeros like Unity does.
2. **Texture copy** (`convert.mjs`): copies `textures/*.png`. Anything without a PNG magic
   number is converted via `sips` (the first rip mislabeled TGA files; this export ships PNGs).
3. **BaseColor embedding** (`convert.mjs`): embeds each material's `_BaseMap` (from preset.json)
   as the glTF `baseColorTexture` (deduplicated — materials share images), so the generic
   glTF/PBR path renders a textured preview.
4. **`material-preset.mjs`**: writes the export's preset.json scoped to the materials the GLB
   references (postmodel exports carry every LOD's `M_actor_lod_*` material), completing texture
   tiling/offset from the Unity material objects in `raw/materials_<model>/` as
   `colors["<slot>_ST"] = [sx, sy, ox, oy]` for non-identity transforms — the one field the
   export does not write yet; an `_ST` the export does write is kept and checked. Everything
   else in the file is the export's, verbatim.
5. **Fur shell layers** (`convert.mjs` `rebuildFurLayers`): the game's fur shader reads each
   shell's layer fraction (root 0 .. tip 1) from the mesh's second UV set. The export now carries
   it (`UV1` on the fur meshes) and a source `TEXCOORD_1` is kept as is; the rebuild below is
   for a fur mesh without one. The shells themselves are in the mesh
   (Ardelia's skirt: 19 copies of the base surface), appended one after another, so for every
   material with `_UseCharacterFur = 1` the layer is rebuilt from the vertex order: the
   vertices sharing one uv0 point, within 2 mm of each other and with the same normal, are one
   stack (the two faces of a thin sheet — deepfin's fins — share uv0 but not a normal), the
   shell count is the gcd of the stack sizes, a vertex's rank by index within its stack is its
   shell, and the shells' mean offset along the normal (26 µm per shell in the first rip,
   0.26 µm in this export — too fine to rank by distance) confirms the order and tells root
   from tip. The log line `[fur] ... 19 shells over 464 stacks` is the check. The attribute is
   tagged in the primitive's extras so `--preset-only` recomputes it; a source that carries
   `TEXCOORD_1` is left alone.
6. **Verification gate** (`convert.mjs`): re-reads the GLB with gltf-transform and fails the
   run if any primitive lacks `TEXCOORD_0`/`TANGENT`/`COLOR_0`, a skinned mesh lacks
   `JOINTS_0`/`WEIGHTS_0`, or the skin has no inverse bind matrices. A mesh on a node without a
   skin is a rigid prop (a weapon parented to a hand joint) and is listed as `rigid=`. It also
   prints mesh/joint/morph/material counts.
7. **Clips** (`clip-glb.mjs`, see below): every `clips/<clip>.fbx` the manifest marks `ok` is
   baked onto the character's skeleton as `clips/<clip>.glb`. After the last character, the
   `_common/<bodyType>` sets are baked on the actor their manifest names.

## Expected output

```
packages/web-client/assets/hgrp/<actor>/   (gitignored — assets are machine-local)
  <actor>.glb      # lod0 meshes + skeleton + skins + morph targets + baseColor preview textures
  preset.json      # per material: { shader, textures(slot→file), floats, ints, colors[rgba],
                   #   keywords, renderQueue?, disabledPasses?, tags? }
  lighting.json    # the Character Info light rig, as exported
  textures/*.png
  clips/<clip>.glb # one animation each, on the character's skeleton (no meshes)
packages/web-client/assets/hgrp/_common/<bodyType>/clips/<clip>.glb
packages/web-client/assets/hgrp/_global/renderpipeline.json
```

The GLB + preset.json are the hand-offs the engine reads: `stages/hgrp/characters.ts` derives
the roster from the folders (`<actor>.glb` + `preset.json`) and the clip pool from every
`clips/*.glb`; the preset feeds the HGRP material family. lighting.json and
renderpipeline.json are carried for the stage-lighting and post-processing work to read.

## Known data facts

- Assets are authored in meters (character ≈ 1.7 units tall); presentation scale is the
  stage's concern, not the converter's. The FBX header declares `UnitScaleFactor` 100 since the
  2026-09-09 export (an earlier one declared 1 over the same metre geometry); the converter
  reads the declaration and cancels it either way, so one FBX unit is always a metre.
- The bind pose is offset from the origin (prefab placement) — compensate in the entity
  transform, not by editing vertices.
- The character FBX's **node defaults are a T-pose, not the bind pose**: the meshes were
  skinned in an A-pose (hands 0.4 m lower), which is what the skin clusters' `TransformLink`
  matrices hold and what Blender builds the armature's rest from. Anything that needs the
  bind pose in FBX frames (the clip bake) reads the clusters, never the node transforms.
- UV sets are named after their Unity channel (`UV0`, `UV1`, `UV2`) and a mesh carries only the
  channels it uses — most are `UV0 + UV2`, fur and VFX-masked meshes add `UV1`. `UV2`
  (`TEXCOORD_2`) is on nearly every outlined mesh; its content is a 2-vector with
  `(u, v − 1)` inside the unit disc, which is **not** the tangent-space smooth normal the
  decompiled outline shader reads (no axis convention decodes it against the position-averaged
  normal), so its meaning is still open and the engine does not read it yet.
- The material objects' `m_Shader.Name` is empty in this export; preset.json is the only
  source of the shader name.
- **Multi-material meshes lose their per-polygon material indices in the 2026-09-09 export**:
  the FBX `LayerElementMaterial` of a mesh with two material slots has an empty `ByPolygon`
  index array, so Blender puts every face on the first slot. Every fur mesh is such a mesh
  (base surface + shells: `fur_01 + fur_02`), so the shells come out with the base material,
  the gated fur material is scoped out of preset.json, and no fur renders — an export-side
  bug (eight characters), not something the converter compensates for.
- A bone skinned by several meshes may carry several different bind matrices (LOD meshes and
  props were bound in another pose). The glb was built from one of them; `clip-glb.mjs
  readBindPose` picks the cluster matching the glb's rest.
- A GLB material with no preset entry is default-filled by the engine (warned at load); the
  preset may contain materials with no mesh in the GLB (scoped out here).

## Animation clips (`clip-glb.mjs`) — external clip files

The clip file contract for anyone producing clips (format, node-path rule, coordinate frames,
delivery routes, validation with `scripts/hgrp/clip-check.mjs`) is `docs/hgrp-clip-format.md`.

Clips are **not** baked into the model. Each `clips/<clip>.fbx` of the export becomes
`<actor>/clips/<clip>.glb`: the character's node hierarchy copied from `<actor>.glb` with
meshes, skins, materials and textures stripped, plus that one animation. The engine discovers
`assets/hgrp/*/clips/*.glb` and `assets/hgrp/_common/*/clips/*.glb` next to the models and joins
a clip onto the loaded model by node path below the scene root
(`renderer/assets/gltfAnimations.ts`) when it is first selected, so the model glb is never
rewritten for a clip and a clip baked on another prefab name still matches. Every clip on the
stage is one pool: a character lists its own clips first (alphabetical, so an entrance precedes
its `_loop`), then the body-type sets, then every other character's as `<folder>/<clip>`,
playable on any rig through the shared Bip001 chain; a character with no clips of its own starts
paused in bind pose.

How a clip FBX is read (`fbx-read.mjs`, `fbx-anim.mjs`; no Blender involved):

- The FBX is parsed directly. Node transforms are `Lcl Translation` / `Lcl Rotation`
  (Euler XYZ, degrees) / `Lcl Scaling`, no pivots or pre-rotations (the reader refuses them);
  the time span is the curves' key range, the rate the file's `TimeMode`
  (60 fps for most clips, 30 for some, one at 10).
- The export keeps Unity's key times, so slowly moving joints are keyed sparsely, in Euler
  angles. Interpolating those linearly in Euler space is not the geodesic the source
  quaternion curve followed — measured against a clip baked from the Unity curves, an arm
  swinging between two keys 20 frames apart ended 0.4 m off at the hand. Every rotation curve is
  therefore re-keyed as quaternions at its key times and interpolated as quaternions; the
  remaining difference to the Unity-curve bake is a few millimetres (mean 4–7 mm over a
  6 s clip), which only dense keys from the export side would remove.
- **Frames**: the glb's joints are Blender bone frames, the clip's nodes FBX node frames, and
  they differ per node by a fixed basis change. The bake takes the bind pose in FBX frames from
  the character FBX's skin clusters (see Known data facts), pairs it with the glb's rest, and
  from that offset re-expresses every driven node's world transform in the glb's frames, frame
  by frame, before decomposing to the joint's local TRS. Keys are then reduced to what LINEAR
  interpolation cannot reproduce (rotation 1e-3, translation 1e-4).
- A clip node the model lacks is reported (`driven nodes not on the model`); duplicate bone
  names (Pelica's weapon decos each have a `Root`) are matched by hierarchy path, with Blender's
  `.001` renaming stripped.

```bash
node scripts/hgrp/clip-check.mjs packages/web-client/assets/hgrp/pelica/pelica.glb \
     packages/web-client/assets/hgrp/pelica/clips/*.glb          # standing pose, paths, no meshes
```

What the export does not deliver (the manifest says so per clip): **humanoid** clips — 3654
of 4663 requested, everything in the `battle`, `customized`, `3c` (locomotion) and most
`interact` categories — store the core skeleton as Unity muscle values and need either a Unity
bake or a muscle-space solver (learnings animation-pipeline.md); `no_keyframes` rows are
camera-only clips. The body-type sets under `_common/` come with the rig they were baked on but
without a character → body-type table, so they are offered to every character like any other
foreign clip.
