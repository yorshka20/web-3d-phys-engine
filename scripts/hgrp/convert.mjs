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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blenderBin = process.env.BLENDER_BIN || 'blender';

function parseArgs(argv) {
  const args = { chars: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = argv[++i];
    else if (argv[i] === '--chars') args.chars = argv[++i].split(',');
    else if (argv[i] === '--out') args.out = argv[++i];
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
  // Prefer the plain P_actor_* prefab over "(1)" duplicates and NPC variants.
  const ranked = candidates
    .filter((f) => path.basename(f).toLowerCase().startsWith('p_actor_'))
    .sort((a, b) => a.length - b.length);
  if (ranked.length === 0) {
    throw new Error(`No P_actor_*.fbx found under ${animatorDir} for ${charName}`);
  }
  return ranked[0];
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
  let assigned = 0;
  for (const material of doc.getRoot().listMaterials()) {
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
  return assigned;
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
      for (const attr of ['TEXCOORD_0', 'TANGENT', 'JOINTS_0', 'WEIGHTS_0']) {
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
  console.log(`[verify] material names: ${root.listMaterials().map((m) => m.getName()).join(', ')}`);
  return problems;
}

const { src, chars, out } = parseArgs(process.argv);
let failed = false;

for (const charName of chars) {
  const charDir = path.join(src, charName);
  const outDir = path.join(out, charName.toLowerCase());
  const glbPath = path.join(outDir, `${charName.toLowerCase()}.glb`);
  console.log(`\n=== ${charName} ===`);

  const fbx = findActorFbx(charDir, charName);
  console.log(`[convert] fbx: ${fbx}`);
  fs.mkdirSync(outDir, { recursive: true });

  const result = spawnSync(
    blenderBin,
    ['--background', '--python', path.join(repoRoot, 'scripts/hgrp/convert-fbx.py'), '--', fbx, glbPath],
    { encoding: 'utf8' },
  );
  const lines = (result.stdout || '').split('\n').filter((l) => l.startsWith('[convert]'));
  console.log(lines.join('\n'));
  if (result.status !== 0 || !fs.existsSync(glbPath)) {
    console.error(`[convert] blender failed for ${charName}:\n${result.stderr}`);
    failed = true;
    continue;
  }

  const texDir = path.join(outDir, 'textures');
  const { copied, converted } = copyTextures(charDir, texDir);
  console.log(`[convert] copied ${copied} textures (${converted} TGA-mislabeled, converted to PNG)`);

  const assigned = await embedBaseColor(glbPath, charDir, texDir);
  console.log(`[convert] embedded ${assigned} baseColor textures`);

  const problems = await verifyGlb(glbPath);
  if (problems.length > 0) {
    console.error(`[verify] FAILED:\n  ${problems.join('\n  ')}`);
    failed = true;
  } else {
    console.log('[verify] OK');
  }
}

process.exit(failed ? 1 : 0);
