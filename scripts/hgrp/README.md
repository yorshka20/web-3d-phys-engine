# HGRP offline asset conversion

Converts AssetRipper-extracted Endfield character rips into engine-consumable assets.
This is deliberately thin glue over third-party tools (Blender, sips, gltf-transform) —
asset processing is not an engine concern; the engine only ever reads the outputs.

## Prerequisites

- **Blender** on `PATH` (`brew install --cask blender`; tested with 5.2.1 LTS).
  Override the binary with `BLENDER_BIN=/path/to/blender` if needed.
- macOS (`sips` is used for image conversion).
- A local AssetRipper character rip laid out as `<rip-root>/<Char>/{Animator,Material,...}`
  (e.g. `~/Downloads/Character/PC/Pelica`). The rip location is machine-local and always
  passed as an argument — never hardcoded.

## Usage

```bash
node scripts/hgrp/convert.mjs --src <rip-root> --chars Pelica[,Si,...]
# optional: --out <dir>   (default: packages/web-client/assets/hgrp)
```

Re-running is safe: outputs are overwritten in place.

## What the pipeline does, per character

1. **`convert-fbx.py`** (run headless by the driver): imports the rigged prefab FBX found at
   `<rip>/<Char>/Animator/P_actor_*/P_actor_*.fbx` (NPC and "(1)" duplicates are skipped),
   deletes `_lod1..9` / `_shadowProxy*` meshes (lod0 is the highest-detail level and the only
   one the engine consumes), and exports a GLB with tangents, skins, and morph targets enabled.
2. **Texture copy + repair** (`convert.mjs`): copies every PNG from `<rip>/<Char>/Animator/`.
   The rip mislabels TGA files as `.png` (browsers cannot decode TGA); anything without a PNG
   magic number is converted to real PNG via `sips`.
3. **BaseColor embedding** (`convert.mjs`): reads each material's `_BaseMap` from the ripped
   `Material/*.json` and embeds it as the glTF `baseColorTexture` (deduplicated — materials
   share images), so the existing glTF/PBR path renders a textured preview before any HGRP
   shader work.
4. **`material-preset.mjs`**: converts the ripped Unity material JSONs into one
   `preset.json` — the game's material ground truth with HGRP property names verbatim.
   `_lod_` material variants are skipped.
5. **Verification gate** (`convert.mjs`): re-reads the GLB with gltf-transform and fails the
   run if any primitive lacks `TEXCOORD_0`/`TANGENT`/`JOINTS_0`/`WEIGHTS_0`, or the skin has
   no inverse bind matrices. It also prints mesh/joint/morph/material counts for eyeballing.

## Expected output

```
packages/web-client/assets/hgrp/<char>/   (gitignored — assets are machine-local)
  <char>.glb      # lod0 meshes + skeleton + skins + morph targets + baseColor preview textures
  textures/*.png  # full character texture set, real PNGs
  preset.json     # per-material: { shader, textures(slot→file), floats, ints, colors[rgba] }
```

The GLB + preset.json are the only hand-offs the engine reads. `stages/hgrp/` imports the GLB
via `?url`; the preset feeds the HGRP material family (Stage B of the HGRP plan).

## Known data facts

- Assets are authored in meters (character ≈ 1.7 units tall); presentation scale is the
  stage's concern, not the converter's.
- The bind pose is offset from the origin (prefab placement) — compensate in the entity
  transform, not by editing vertices.
- The GLB may contain materials with no preset entry (shared/common materials the rip does
  not export per-character, e.g. `M_eyewhiteshadow_common_01`) — the engine must default-fill
  those. The preset may likewise contain materials with no mesh in the GLB.
- FBX prefabs carry **no animation clips**; clips require a separate offline bake
  (Unity editor re-export or Blender retarget) when animation work starts.
