/**
 * HGRP asset conversion driver (Stage A1).
 *
 * Batch-converts AssetRipper character rips into engine-consumable assets:
 *   node scripts/hgrp/convert.mjs --src <rip-root> --chars Pelica[,Si,...]
 *
 * Per character:
 *   1. Blender headless FBX -> GLB (scripts/hgrp/convert-fbx.py)
 *   2. copy the character texture PNGs (they live in the rip's Animator/ folder)
 *   3. embed each material's _BaseMap (read from the rip's Material/*.json) as the glTF
 *      baseColorTexture, so the existing glTF/PBR path renders a textured preview
 *   4. verify the GLB with gltf-transform: skin/joints/IBM, per-primitive
 *      TANGENT/JOINTS_0/WEIGHTS_0/TEXCOORD_0, morph targets — fails loudly.
 *
 * Output: packages/web-client/assets/hgrp/<char>/{<char>.glb, textures/}
 * The rip root is machine-local and always passed as an argument.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { buildPreset } from './material-preset.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blenderBin = process.env.BLENDER_BIN || 'blender';

function parseArgs(argv) {
  const args = { chars: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = argv[++i];
    else if (argv[i] === '--chars') args.chars = argv[++i].split(',');
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--no-anim') args.noAnim = true;
  }
  if (!args.src || args.chars.length === 0) {
    console.error('Usage: node scripts/hgrp/convert.mjs --src <rip-root> --chars Pelica[,...]');
    process.exit(1);
  }
  args.out = args.out || path.join(repoRoot, 'packages/web-client/assets/hgrp');
  return args;
}

function findActorFbx(charDir, charName) {
  const animatorDir = path.join(charDir, 'Animator');
  const candidates = [];
  for (const entry of fs.readdirSync(animatorDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(animatorDir, entry.name))) {
      if (file.toLowerCase().endsWith('.fbx')) {
        candidates.push(path.join(animatorDir, entry.name, file));
      }
    }
  }
  // Two naming schemes appear across the rip: some characters ship a `P_actor_*` prefab
  // (Pelica), others only the `chr_<id>_<name>_postmodel` mesh (Laevatian). Both carry the
  // full body; the other Animator entries are decorations (deco_*), the UI bust (uimodel)
  // and attachment widgets (Att_widget_*), which must never win. Shortest name first drops
  // the "(1)" duplicates.
  const byPreference = [
    (f) => path.basename(f).toLowerCase().startsWith('p_actor_'),
    (f) => /_postmodel\.fbx$/i.test(f) && !/^att_widget_/i.test(path.basename(f)),
  ];
  for (const accept of byPreference) {
    const ranked = candidates.filter(accept).sort((a, b) => a.length - b.length);
    if (ranked.length > 0) return ranked[0];
  }
  throw new Error(
    `No actor FBX (P_actor_*.fbx or *_postmodel.fbx) found under ${animatorDir} for ${charName}`,
  );
}

// The prop a character carries (Laevatian's ice cream, `bingqilin_move_jnt` +
// `yingtao_move_jnt`), rigged on its own 2-3 bone armature rather than the character's.
// Present for 4 of the 25 ripped characters; absent is normal, not an error.
function findWidgetFbx(charDir) {
  const animatorDir = path.join(charDir, 'Animator');
  for (const entry of fs.readdirSync(animatorDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^Att_widget_/i.test(entry.name)) continue;
    for (const file of fs.readdirSync(path.join(animatorDir, entry.name))) {
      if (file.toLowerCase().endsWith('.fbx')) {
        return path.join(animatorDir, entry.name, file);
      }
    }
  }
  return undefined;
}

function runBlender(fbx, glbPath) {
  const result = spawnSync(
    blenderBin,
    [
      '--background',
      '--python',
      path.join(repoRoot, 'scripts/hgrp/convert-fbx.py'),
      '--',
      fbx,
      glbPath,
    ],
    { encoding: 'utf8' },
  );
  console.log(
    (result.stdout || '')
      .split('\n')
      .filter((line) => line.startsWith('[convert]'))
      .join('\n'),
  );
  return result.status === 0 && fs.existsSync(glbPath) ? undefined : result.stderr;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function copyTextures(charDir, outTexDir) {
  const animatorDir = path.join(charDir, 'Animator');
  fs.mkdirSync(outTexDir, { recursive: true });
  let copied = 0;
  let converted = 0;
  for (const file of fs.readdirSync(animatorDir)) {
    if (!file.toLowerCase().endsWith('.png')) continue;
    const srcPath = path.join(animatorDir, file);
    const outPath = path.join(outTexDir, file);
    const head = Buffer.alloc(4);
    const fd = fs.openSync(srcPath, 'r');
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    if (head.equals(PNG_MAGIC)) {
      fs.copyFileSync(srcPath, outPath);
    } else {
      // AssetRipper mislabels its TGA exports as .png; browsers cannot decode TGA, so
      // convert to real PNG here. sips is macOS-only — same machines this rip lives on.
      const tmpTga = outPath.replace(/\.png$/i, '.tmp.tga');
      fs.copyFileSync(srcPath, tmpTga);
      const result = spawnSync('sips', ['-s', 'format', 'png', tmpTga, '--out', outPath], {
        encoding: 'utf8',
      });
      fs.rmSync(tmpTga);
      if (result.status !== 0) {
        throw new Error(`sips conversion failed for ${file}: ${result.stderr}`);
      }
      converted++;
    }
    copied++;
  }
  return { copied, converted };
}

async function embedBaseColor(glbPath, charDir, texDir) {
  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const textureCache = new Map();
  const materialNames = [];
  let assigned = 0;
  for (const material of doc.getRoot().listMaterials()) {
    materialNames.push(material.getName());
    const matJsonPath = path.join(charDir, 'Material', `${material.getName()}.json`);
    if (!fs.existsSync(matJsonPath)) continue;
    const matJson = JSON.parse(fs.readFileSync(matJsonPath, 'utf8'));
    const baseName = matJson.m_SavedProperties?.m_TexEnvs?._BaseMap?.m_Texture?.Name;
    if (!baseName) continue;
    const texPath = path.join(texDir, `${baseName}.png`);
    if (!fs.existsSync(texPath)) continue;
    // Materials share textures (e.g. cloth_03 reuses cloth_01's BaseMap) — embed each image once.
    let texture = textureCache.get(baseName);
    if (!texture) {
      texture = doc
        .createTexture(baseName)
        .setImage(fs.readFileSync(texPath))
        .setMimeType('image/png');
      textureCache.set(baseName, texture);
    }
    material.setBaseColorTexture(texture);
    assigned++;
  }
  await io.write(glbPath, doc);
  return { assigned, materialNames };
}

async function verifyGlb(glbPath) {
  const doc = await new NodeIO().read(glbPath);
  const root = doc.getRoot();
  const skins = root.listSkins();
  const meshes = root.listMeshes();
  const problems = [];

  if (skins.length === 0) problems.push('no skin');
  for (const skin of skins) {
    if (!skin.getInverseBindMatrices()) problems.push(`skin ${skin.getName()}: no IBM`);
  }

  let morphTargets = 0;
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      morphTargets += prim.listTargets().length;
      for (const attr of ['TEXCOORD_0', 'TANGENT', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0']) {
        if (!prim.getAttribute(attr)) {
          problems.push(`${mesh.getName()}: missing ${attr}`);
        }
      }
    }
  }

  console.log(
    `[verify] meshes=${meshes.length} skins=${skins.length}` +
      ` joints=${skins[0]?.listJoints().length ?? 0}` +
      ` materials=${root.listMaterials().length} morphTargets=${morphTargets}`,
  );
  console.log(
    `[verify] material names: ${root
      .listMaterials()
      .map((m) => m.getName())
      .join(', ')}`,
  );
  return problems;
}

const { src, chars, out, noAnim } = parseArgs(process.argv);
let failed = false;

for (const charName of chars) {
  const charDir = path.join(src, charName);
  const outDir = path.join(out, charName.toLowerCase());
  const glbPath = path.join(outDir, `${charName.toLowerCase()}.glb`);
  console.log(`\n=== ${charName} ===`);

  const fbx = findActorFbx(charDir, charName);
  console.log(`[convert] fbx: ${fbx}`);
  fs.mkdirSync(outDir, { recursive: true });

  const blenderError = runBlender(fbx, glbPath);
  if (blenderError !== undefined) {
    console.error(`[convert] blender failed for ${charName}:\n${blenderError}`);
    failed = true;
    continue;
  }

  const texDir = path.join(outDir, 'textures');
  const { copied, converted } = copyTextures(charDir, texDir);
  console.log(
    `[convert] copied ${copied} textures (${converted} TGA-mislabeled, converted to PNG)`,
  );

  const { assigned, materialNames } = await embedBaseColor(glbPath, charDir, texDir);
  console.log(`[convert] embedded ${assigned} baseColor textures`);

  // The widget is a second GLB beside the character's, sharing its textures and preset:
  // its materials come from the same rip Material/ directory and its textures were already
  // copied above, so only the mesh needs converting.
  const widgetFbx = findWidgetFbx(charDir);
  const widgetMaterialNames = [];
  if (widgetFbx) {
    const widgetGlbPath = path.join(outDir, 'widget.glb');
    console.log(`[convert] widget fbx: ${widgetFbx}`);
    const widgetError = runBlender(widgetFbx, widgetGlbPath);
    if (widgetError !== undefined) {
      console.error(`[convert] blender failed for ${charName}'s widget:\n${widgetError}`);
      failed = true;
    } else {
      const widget = await embedBaseColor(widgetGlbPath, charDir, texDir);
      widgetMaterialNames.push(...widget.materialNames);
      console.log(`[convert] widget: ${widget.materialNames.length} materials`);
    }
  }

  const preset = buildPreset(
    charDir,
    texDir,
    charName.toLowerCase(),
    new Set([...materialNames, ...widgetMaterialNames]),
  );
  const presetPath = path.join(outDir, 'preset.json');
  fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2));
  console.log(`[preset] wrote ${Object.keys(preset.materials).length} materials -> ${presetPath}`);

  // Baking clips is part of converting a character, not a separate errand: a character
  // without its animation renders in bind pose. Clip choice is automatic (rig-coverage
  // test in anim-convert); --no-anim skips it, and anim-convert can still be re-run by
  // hand with an explicit --clips list.
  if (!noAnim) {
    const anim = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'scripts/hgrp/anim-convert.mjs'),
        '--src',
        src,
        '--char',
        charName,
        '--out',
        out,
        '--auto',
      ],
      { encoding: 'utf8' },
    );
    console.log(
      (anim.stdout || '')
        .split('\n')
        .filter((l) => l.startsWith('[anim-convert]'))
        .join('\n'),
    );
    if (anim.status !== 0) {
      console.error(`[anim-convert] failed for ${charName}:\n${anim.stderr}`);
      failed = true;
    }
  }

  const problems = await verifyGlb(glbPath);
  if (problems.length > 0) {
    console.error(`[verify] FAILED:\n  ${problems.join('\n  ')}`);
    failed = true;
  } else {
    console.log('[verify] OK');
  }
}

process.exit(failed ? 1 : 0);
