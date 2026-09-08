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
    raw/                   the Unity objects behind the above, for reference
  _global/renderpipeline.json   the HGRP volume / pipeline settings (copied through)
```

## Usage

```bash
node scripts/hgrp/convert.mjs --src <export-root>                    # every actor
node scripts/hgrp/convert.mjs --src <export-root> --chars ardelia,laevat
# optional: --out <dir>     (default: packages/web-client/assets/hgrp)
#           --preset-only   (rewrite preset.json + fur layers only; no Blender, no textures)
```

Re-running is safe: a full run rebuilds the actor's output folder from scratch.

## What the pipeline does, per actor

1. **`convert-fbx.py`** (run headless by the driver): imports `<actor>_uimodel.fbx`
   (`<actor>_postmodel.fbx` when there is no uimodel), deletes `_lod1..9` / `_shadowProxy*`
   meshes (lod0 is the only level the engine consumes), bakes the **position-averaged normal**
   of every kept mesh into `COLOR_0` (xyz * 0.5 + 0.5 — the `_OutlineAverageNormal` the HGRP
   inverted-hull outline extrudes along, so the hull stays closed across hard edges and UV
   seams; only same-facing normals are averaged so double-sided cards keep both sides), and
   exports a GLB with tangents, skins, and morph targets enabled. The bake is written in glTF
   axes: the exporter converts positions/normals Z-up → Y-up but leaves color attributes as
   they are.
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
   shell's layer fraction (root 0 .. tip 1) from the mesh's second UV set, which the FBX does
   not carry — every geometry has exactly one UV layer. The shells themselves are in the mesh
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

## Expected output

```
packages/web-client/assets/hgrp/<actor>/   (gitignored — assets are machine-local)
  <actor>.glb      # lod0 meshes + skeleton + skins + morph targets + baseColor preview textures
  preset.json      # per material: { shader, textures(slot→file), floats, ints, colors[rgba],
                   #   keywords, renderQueue?, disabledPasses?, tags? }
  lighting.json    # the Character Info light rig, as exported
  textures/*.png
packages/web-client/assets/hgrp/_global/renderpipeline.json
```

The GLB + preset.json are the hand-offs the engine reads: `stages/hgrp/characters.ts` derives
the roster from the folders (`<actor>.glb` + `preset.json`); the preset feeds the HGRP material
family. lighting.json and renderpipeline.json are carried for the stage-lighting and
post-processing work to read.

## Known data facts

- Assets are authored in meters (character ≈ 1.7 units tall); presentation scale is the
  stage's concern, not the converter's.
- The bind pose is offset from the origin (prefab placement) — compensate in the entity
  transform, not by editing vertices.
- The FBX carries **no animation clips** (AnimStack 0) and **one UV set** per geometry. Clips
  are separate client assets and need their own export path; the second UV set (fur layer
  index, the VFX mask's UV set) is what the layer rebuild above stands in for.
- The material objects' `m_Shader.Name` is empty in this export; preset.json is the only
  source of the shader name.
- A GLB material with no preset entry is default-filled by the engine (warned at load); the
  preset may contain materials with no mesh in the GLB (scoped out here).

## Animation clips (`anim-convert.mjs`, first-rip layout only)

`anim-convert.mjs` / `anim-clip.mjs` bake Unity `.anim` clips from the **first** AssetRipper rip
(`<rip>/<Char>/Animator/...`) into a GLB. That layout is not this export's, and the clip layer
as a whole is slated for replacement by a Unity batch export (learnings animation-pipeline.md):
`--auto` counts node paths without asking whether they belong to this character's rig,
`m_EulerCurves` is never read, and the rig-root axis correction assumes exactly one rig root.
Always inspect a baked clip before trusting it. A GLB with no animation composes its bind pose
correctly.
