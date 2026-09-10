/**
 * HGRP asset conversion driver (Stage A1).
 *
 * Batch-converts a character rip into engine-consumable assets:
 *   node scripts/hgrp/convert.mjs --src <rip-root> [--chars ardelia[,laevat,...]]
 *
 * The rip root is the `out/` folder the extraction tool writes, one folder per character id:
 *   <rip-root>/<actor>/<actor>_uimodel.fbx      the Character Info display model (LOD0 only,
 *                                                materials 1:1 with the material set) — used
 *   <rip-root>/<actor>/<actor>_postmodel.fbx    the in-world model with its LOD chain; the
 *                                                only model of a few characters
 *   <rip-root>/<actor>/preset.json              the material set in the engine's schema — the
 *                                                material ground truth, copied through
 *   <rip-root>/<actor>/textures/*.png           every texture the materials reference
 *   <rip-root>/<actor>/raw/materials_<model>/   the Unity material JSONs (AssetRipper shape),
 *                                                for reference — read only for what the export
 *                                                does not write yet (texture tiling, see
 *                                                material-preset.mjs)
 *   <rip-root>/<actor>/lighting.json            the Character Info light rig (copied through)
 *   <rip-root>/<actor>/clips/<clip>.fbx         one animation clip each: the skeleton and one
 *                                                take, no meshes (clips/manifest.json lists
 *                                                every clip requested and what became of it)
 *   <rip-root>/_common/<bodyType>/clips/*.fbx   clip sets shared by body type, baked on one
 *                                                actor's rig (the manifest's `animator`)
 *   <rip-root>/_global/renderpipeline.json      the HGRP volume / pipeline settings (copied)
 *
 * Per character:
 *   1. Blender headless FBX -> GLB (scripts/hgrp/convert-fbx.py), then each UV set moved to
 *      TEXCOORD_<Unity channel> (slotUvSets)
 *   2. copy the character's texture PNGs
 *   3. embed each material's _BaseMap as the glTF baseColorTexture, so the existing glTF/PBR
 *      path renders a textured preview
 *   4. write preset.json: the export's, scoped to the GLB's materials and completed with the
 *      texture tiling (material-preset.mjs)
 *   5. rebuild the fur shells' layer fraction into TEXCOORD_1 where the source has no UV1
 *      (see rebuildFurLayers)
 *   6. verify the GLB with gltf-transform: skin/joints/IBM, per-primitive TEXCOORD_0/TANGENT/
 *      COLOR_0 (plus JOINTS_0/WEIGHTS_0 on skinned meshes; a rigid weapon has none), morph
 *      targets — fails loudly.
 *   7. clips: every clips/<clip>.fbx evaluated and baked onto the character glb's skeleton
 *      (clip-glb.mjs, no Blender involved) as clips/<clip>.glb, plus clips/index.json (name,
 *      duration, whether the clip moves the body); the engine joins them onto the model by
 *      node path.
 * Then the _common body-type clip sets, baked on the actor their manifest names.
 *
 * --preset-only rewrites preset.json (and the fur layers) without touching Blender or
 * textures — for a re-exported material set. --clips-only rebakes the clips of the selected
 * characters (and the _common sets) against the already converted models.
 *
 * Output: packages/web-client/assets/hgrp/<actor>/{<actor>.glb, preset.json, lighting.json,
 * textures/, clips/} and assets/hgrp/_common/<bodyType>/clips/. A full run rebuilds a
 * character's output folder from scratch, so nothing stale survives. The rip root is
 * machine-local and always passed as an argument.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { readBindPose, writeClipGlb } from './clip-glb.mjs';
import { completePreset, readRawMaterials } from './material-preset.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blenderBin = process.env.BLENDER_BIN || 'blender';

function parseArgs(argv) {
  const args = { chars: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = argv[++i];
    else if (argv[i] === '--chars') args.chars = argv[++i].split(',');
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--preset-only') args.presetOnly = true;
    else if (argv[i] === '--clips-only') args.clipsOnly = true;
  }
  if (!args.src) {
    console.error(
      'Usage: node scripts/hgrp/convert.mjs --src <rip-root> [--chars ardelia[,...]] ' +
        '[--preset-only | --clips-only]',
    );
    process.exit(1);
  }
  args.out = args.out || path.join(repoRoot, 'packages/web-client/assets/hgrp');
  return args;
}

// Every character folder in the rip: anything that is not a `_`-prefixed shared folder.
function listActors(src) {
  return fs
    .readdirSync(src, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();
}

// The uimodel is the Character Info display model — LOD0 only, and the model the artists
// tuned materials and lighting against; its material names match the material set one to
// one. The postmodel adds the LOD chain (its merged `M_actor_lod_*` materials are skipped by
// the preset) and is the only model a few characters ship.
function findActorFbx(actorDir, actor) {
  for (const kind of ['uimodel', 'postmodel']) {
    const fbx = path.join(actorDir, `${actor}_${kind}.fbx`);
    if (fs.existsSync(fbx)) return { fbx, kind };
  }
  throw new Error(`No ${actor}_uimodel.fbx or ${actor}_postmodel.fbx under ${actorDir}`);
}

// The export's material set and, beside it, the Unity material objects of the model being
// converted (raw/materials_<model>; the GLB joins on the material name).
function readExportMaterials(actorDir, kind) {
  const presetPath = path.join(actorDir, 'preset.json');
  if (!fs.existsSync(presetPath)) {
    throw new Error(`No preset.json under ${actorDir}`);
  }
  const exported = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
  const rawDir = path.join(actorDir, 'raw', `materials_${kind}`);
  const raw = fs.existsSync(rawDir) ? readRawMaterials(rawDir) : new Map();
  return { exported, raw };
}

function resetDir(outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
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

function copyTextures(srcTexDir, outTexDir) {
  fs.mkdirSync(outTexDir, { recursive: true });
  let copied = 0;
  let converted = 0;
  for (const file of fs.readdirSync(srcTexDir)) {
    if (!file.toLowerCase().endsWith('.png')) continue;
    const srcPath = path.join(srcTexDir, file);
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

async function embedBaseColor(glbPath, exported, texDir) {
  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const textureCache = new Map();
  const materialNames = [];
  let assigned = 0;
  for (const material of doc.getRoot().listMaterials()) {
    materialNames.push(material.getName());
    const baseName = exported.materials[material.getName()]?.textures?._BaseMap;
    if (!baseName) continue;
    const texPath = path.join(texDir, baseName);
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

// The export names a mesh's UV layers after the Unity channel they came from and a mesh has
// only the channels it uses (most are UV0 + UV2: the fur layer / VFX mask set, UV1, is rare),
// so Blender's exporter — which numbers TEXCOORD_n by layer position — would hand the engine
// UV2's data as TEXCOORD_1. convert-fbx.py records the channel list on the mesh
// (`hgrpUvSets`, as glTF mesh extras) and each set is moved back to TEXCOORD_<channel> here;
// a channel the mesh lacks stays absent, which the loader reads as zeros — the same value a
// missing vertex stream has in Unity.
const UV_SETS_EXTRA = 'hgrpUvSets';

async function slotUvSets(glbPath) {
  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const report = [];
  let changed = false;
  for (const mesh of doc.getRoot().listMeshes()) {
    const { [UV_SETS_EXTRA]: channels, ...extras } = mesh.getExtras();
    if (!Array.isArray(channels)) {
      throw new Error(
        `${mesh.getName()}: no ${UV_SETS_EXTRA} record — convert-fbx.py did not write it`,
      );
    }
    for (const prim of mesh.listPrimitives()) {
      const sets = channels.map((channel, i) => [channel, prim.getAttribute(`TEXCOORD_${i}`)]);
      if (sets.some(([, accessor]) => !accessor)) {
        throw new Error(
          `${mesh.getName()}: ${channels.length} UV channels recorded but fewer TEXCOORD sets exported`,
        );
      }
      for (let i = 0; i < channels.length; i++) prim.setAttribute(`TEXCOORD_${i}`, null);
      for (const [channel, accessor] of sets) prim.setAttribute(`TEXCOORD_${channel}`, accessor);
      if (channels.some((channel, i) => channel !== i)) changed = true;
    }
    mesh.setExtras(extras);
    changed = true;
    if (channels.some((channel, i) => channel !== i)) {
      report.push(
        `${mesh.getName()}: UV${channels.join('/UV')} -> TEXCOORD_${channels.join('/TEXCOORD_')}`,
      );
    }
  }
  if (changed) await io.write(glbPath, doc);
  return report;
}

async function readMaterialNames(glbPath) {
  const doc = await new NodeIO().read(glbPath);
  return doc
    .getRoot()
    .listMaterials()
    .map((material) => material.getName());
}

// The fur shells are baked into the mesh: N copies of the base surface stacked along the
// normal a hair's breadth apart (Ardelia's skirt: 19 copies of 497 vertices, 26 µm steps —
// in both rips once the FBX is read in metres; read at the 2026-09 export's declared
// centimetres they looked 0.26 µm apart, see convert-fbx.py). The game's fur shader reads each
// shell's layer fraction — 0 at the root, 1 at the tip — from the mesh's second UV set, which
// the FBX does not carry. What the mesh does carry is its construction: the shells are appended
// one after another, so among the vertices that share one uv0 point — one stack — the vertex
// order is the shell order, which needs no spacing to be resolved at all. The shells of one stack are copies — same position to within microns, the
// same normal — while the two faces of a thin two-sided sheet (deepfin's fins: front and back
// 0.35 mm apart, normals opposed, shells interleaved) and mirrored parts share uv0 without
// being one stack, so a uv0 group is split by position and normal before it is read as a
// stack; seam duplicates sit side by side within a shell. The shell count is
// the gcd of the stack sizes, and the shells' mean offset along the base normal must run
// monotonically with the shell rank, which also tells the root end from the tip. Written as
// TEXCOORD_1 = (layer, 0) on the fur primitives only and tagged in the primitive's extras so a
// re-run recomputes it; a source that carries its own TEXCOORD_1 is left alone. Every other
// primitive keeps no second UV set and the engine reads 0 there.
const FUR_LAYERS_EXTRA = 'hgrpFurLayers';
const FUR_STACK_RADIUS = 0.002;
const FUR_STACK_NORMAL_DOT = 0.99;

function furShellLayers(prim, label) {
  const position = prim.getAttribute('POSITION');
  const normal = prim.getAttribute('NORMAL');
  const uv = prim.getAttribute('TEXCOORD_0');
  const count = position.getCount();
  const P = new Float32Array(count * 3);
  const N = new Float32Array(count * 3);
  const groups = new Map();
  const p = [0, 0, 0];
  const t = [0, 0];
  for (let i = 0; i < count; i++) {
    position.getElement(i, p);
    P.set(p, i * 3);
    normal.getElement(i, p);
    N.set(p, i * 3);
    uv.getElement(i, t);
    const key = `${t[0].toFixed(5)},${t[1].toFixed(5)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(i);
  }
  const dist = (a, b) =>
    Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  const aligned = (a, b) =>
    N[a * 3] * N[b * 3] + N[a * 3 + 1] * N[b * 3 + 1] + N[a * 3 + 2] * N[b * 3 + 2] >
    FUR_STACK_NORMAL_DOT;
  const stacks = [];
  for (const members of groups.values()) {
    const parts = [];
    for (const i of members) {
      const part = parts.find((s) => dist(s[0], i) < FUR_STACK_RADIUS && aligned(s[0], i));
      if (part) part.push(i);
      else parts.push([i]);
    }
    stacks.push(...parts);
  }

  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  let shells = 0;
  for (const stack of stacks) shells = gcd(shells, stack.length);
  if (shells < 2) {
    return undefined;
  }

  const shellOf = new Int32Array(count);
  const offsets = new Float64Array(shells);
  const q = [0, 0, 0];
  const n = [0, 0, 0];
  for (const stack of stacks) {
    stack.sort((a, b) => a - b);
    const duplicates = stack.length / shells;
    position.getElement(stack[0], q);
    normal.getElement(stack[0], n);
    stack.forEach((i, rank) => {
      const shell = Math.floor(rank / duplicates);
      shellOf[i] = shell;
      position.getElement(i, p);
      offsets[shell] += (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] + (p[2] - q[2]) * n[2];
    });
  }
  let increasing = true;
  let decreasing = true;
  for (let shell = 1; shell < shells; shell++) {
    if (offsets[shell] <= offsets[shell - 1]) increasing = false;
    if (offsets[shell] >= offsets[shell - 1]) decreasing = false;
  }
  if (!increasing && !decreasing) {
    const steps = [...offsets].map((v) => ((v / stacks.length) * 1e6).toFixed(2)).join(' ');
    throw new Error(
      `${label}: shell offsets along the normal are not monotonic (${steps} µm) — the vertex order within a stack is not the shell order`,
    );
  }

  const attribute = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    attribute[i * 2] = (increasing ? shellOf[i] : shells - 1 - shellOf[i]) / (shells - 1);
  }
  return { attribute, shells, stacks: stacks.length, rootLast: !increasing };
}

async function rebuildFurLayers(glbPath, preset) {
  const furMaterials = new Set(
    Object.entries(preset.materials)
      .filter(([, material]) => material.floats?._UseCharacterFur === 1)
      .map(([name]) => name),
  );
  if (furMaterials.size === 0) return [];
  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const buffer = doc.getRoot().listBuffers()[0];
  const report = [];
  let written = false;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const materialName = prim.getMaterial()?.getName();
      if (!furMaterials.has(materialName)) continue;
      const label = `${mesh.getName()} / ${materialName}`;
      if (prim.getAttribute('TEXCOORD_1') && !prim.getExtras()?.[FUR_LAYERS_EXTRA]) {
        report.push(`${label}: TEXCOORD_1 present in the source, kept`);
        continue;
      }
      const layers = furShellLayers(prim, label);
      if (!layers) {
        report.push(`${label}: no shell stack (one vertex per uv0), no layers written`);
        continue;
      }
      prim.setAttribute(
        'TEXCOORD_1',
        doc.createAccessor().setType('VEC2').setArray(layers.attribute).setBuffer(buffer),
      );
      prim.setExtras({
        ...prim.getExtras(),
        [FUR_LAYERS_EXTRA]: { shells: layers.shells, stacks: layers.stacks },
      });
      written = true;
      report.push(
        `${label}: ${layers.shells} shells over ${layers.stacks} stacks` +
          (layers.rootLast ? ' (root is the last shell)' : ''),
      );
    }
  }
  if (written) await io.write(glbPath, doc);
  return report;
}

// The clips the export wrote for one folder: the manifest names the rig they were baked on
// (`animator`, the prefab root's name) and lists every requested clip with its outcome; only
// `ok` rows have a file.
function readClipManifest(clipDir) {
  const manifestPath = path.join(clipDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const clips = (manifest.clips ?? [])
    .filter((row) => row.status === 'ok' && row.file)
    .map((row) => ({ name: row.name, fbx: path.join(clipDir, row.file) }))
    .filter((row) => fs.existsSync(row.fbx));
  const skipped = (manifest.clips ?? []).filter((row) => row.status !== 'ok').length;
  return { animator: manifest.animator, clips, skipped };
}

// The character folder a manifest's animator was baked on: `chr_0023_antal_uimodel` -> `antal`.
function actorOfAnimator(animator) {
  return /^chr_\d+_(.+?)_(?:uimodel|postmodel)$/.exec(animator ?? '')?.[1];
}

/**
 * Bake every clip of `clipDir` onto the character whose glb and FBX are given, writing
 * `<outClipsDir>/<clip>.glb`. The output folder is rebuilt from scratch.
 */
async function convertClips(clipDir, modelGlbPath, modelFbxPath, outClipsDir, label) {
  const manifest = readClipManifest(clipDir);
  if (!manifest) {
    console.log(`[clips] ${label}: no clips/manifest.json, nothing to convert`);
    return true;
  }
  if (!fs.existsSync(modelGlbPath)) {
    console.error(`[clips] ${label}: model ${modelGlbPath} missing — convert the character first`);
    return false;
  }
  resetDir(outClipsDir);
  if (manifest.clips.length === 0) {
    console.log(`[clips] ${label}: 0 clips exported (${manifest.skipped} skipped by the export)`);
    return true;
  }
  const t0 = Date.now();
  const bindPose = await readBindPose(modelFbxPath, modelGlbPath);
  let ok = true;
  const index = [];
  for (const clip of manifest.clips) {
    try {
      const report = await writeClipGlb(
        modelGlbPath,
        bindPose,
        clip.fbx,
        path.join(outClipsDir, `${clip.name}.glb`),
        { name: clip.name, animatorName: manifest.animator },
      );
      index.push({
        name: clip.name,
        file: `${clip.name}.glb`,
        duration: Number(report.duration.toFixed(4)),
        fps: report.fps,
        joints: report.driven,
        drivesBody: report.drivesBody,
      });
      const drops =
        report.unmatched.length > 0
          ? ` (${report.unmatched.length} driven nodes not on the model, first ${report.unmatched[0]})`
          : '';
      console.log(
        `[clips] ${label}/${clip.name}: ${report.duration.toFixed(2)}s @ ${report.fps} fps, ` +
          `${report.driven} joints${report.drivesBody ? '' : ' (overlay: body not driven)'}, ` +
          `${report.channels} channels, ${report.keys} keys${drops}`,
      );
    } catch (error) {
      ok = false;
      console.error(
        `[clips] ${label}/${clip.name}: FAILED ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  // What the engine needs to know about a clip before fetching it: how long it is and whether
  // it moves the body (the default clip must; an overlay fragment played alone flings the cloth)
  index.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  fs.writeFileSync(path.join(outClipsDir, 'index.json'), JSON.stringify({ clips: index }, null, 2));
  console.log(
    `[clips] ${label}: ${manifest.clips.length} clips in ${((Date.now() - t0) / 1000).toFixed(0)}s ` +
      `(${index.filter((c) => c.drivesBody).length} move the body; ${manifest.skipped} skipped by the ` +
      `export; bind pose from ${bindPose.skinned} skinned bones)`,
  );
  return ok;
}

// The shared body-type clip sets: each folder's manifest names the actor whose rig it was
// baked on, and the clips land beside the characters under _common/<bodyType>/clips.
async function convertCommonClips(src, out) {
  const commonDir = path.join(src, '_common');
  if (!fs.existsSync(commonDir)) return true;
  let ok = true;
  for (const bodyType of fs.readdirSync(commonDir).sort()) {
    const clipDir = path.join(commonDir, bodyType, 'clips');
    if (!fs.existsSync(clipDir)) continue;
    const manifest = readClipManifest(clipDir);
    const actor = actorOfAnimator(manifest?.animator);
    if (!actor) {
      console.error(
        `[clips] _common/${bodyType}: manifest names no actor rig (${manifest?.animator})`,
      );
      ok = false;
      continue;
    }
    const converted = await convertClips(
      clipDir,
      path.join(out, actor, `${actor}.glb`),
      findActorFbx(path.join(src, actor), actor).fbx,
      path.join(out, '_common', bodyType, 'clips'),
      `_common/${bodyType} (on ${actor})`,
    );
    ok = ok && converted;
  }
  return ok;
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

  // Units: the game's characters are metres tall and the exporter parks only its Z-up to
  // Y-up rotation on the scene root, never a scale. An FBX read at a wrong unit fails both
  // (convert-fbx.py reads UnitScaleFactor and cancels it; this is the check that it did).
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  for (const node of scene?.listChildren() ?? []) {
    const scale = node.getScale();
    if (scale.some((v) => Math.abs(v - 1) > 1e-3)) {
      problems.push(`scene root ${node.getName()} is scaled [${scale.map((v) => v.toFixed(4))}]`);
    }
  }
  let minY = Infinity;
  let maxY = -Infinity;
  const p = [0, 0, 0];
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, p);
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }
  }
  const height = maxY - minY;
  if (!(height > 0.3 && height < 8)) {
    problems.push(`model height ${height.toFixed(4)} m is not a character's — check the FBX unit`);
  }

  // A mesh on a node without a skin is rigid — a weapon parented to a hand joint — and carries
  // no JOINTS_0/WEIGHTS_0 by design; the engine draws it in its node's frame.
  const skinnedMeshes = new Set();
  for (const node of root.listNodes()) {
    if (node.getMesh() && node.getSkin()) skinnedMeshes.add(node.getMesh());
  }
  const rigid = [];
  let morphTargets = 0;
  for (const mesh of meshes) {
    if (!skinnedMeshes.has(mesh)) rigid.push(mesh.getName());
    for (const prim of mesh.listPrimitives()) {
      morphTargets += prim.listTargets().length;
      const required = skinnedMeshes.has(mesh)
        ? ['TEXCOORD_0', 'TANGENT', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0']
        : ['TEXCOORD_0', 'TANGENT', 'COLOR_0'];
      for (const attr of required) {
        if (!prim.getAttribute(attr)) {
          problems.push(`${mesh.getName()}: missing ${attr}`);
        }
      }
    }
  }

  console.log(
    `[verify] meshes=${meshes.length} skins=${skins.length}` +
      ` joints=${skins[0]?.listJoints().length ?? 0}` +
      ` materials=${root.listMaterials().length} morphTargets=${morphTargets}` +
      ` height=${height.toFixed(3)}m` +
      (rigid.length > 0 ? ` rigid=${rigid.join(',')}` : ''),
  );
  console.log(
    `[verify] material names: ${root
      .listMaterials()
      .map((m) => m.getName())
      .join(', ')}`,
  );
  return problems;
}

const { src, chars, out, presetOnly, clipsOnly } = parseArgs(process.argv);
const actors = chars.length > 0 ? chars : listActors(src);
let failed = false;

const globalConfig = path.join(src, '_global', 'renderpipeline.json');
if (!presetOnly && fs.existsSync(globalConfig)) {
  fs.mkdirSync(path.join(out, '_global'), { recursive: true });
  fs.copyFileSync(globalConfig, path.join(out, '_global', 'renderpipeline.json'));
  console.log('[convert] copied _global/renderpipeline.json');
}

async function writePreset({ exported, raw }, texDir, glbPath, outDir) {
  const names = new Set(await readMaterialNames(glbPath));
  const { preset, completed } = completePreset(exported, raw, texDir, names);
  const presetPath = path.join(outDir, 'preset.json');
  fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2));
  console.log(
    `[preset] wrote ${Object.keys(preset.materials).length} of the export's ` +
      `${Object.keys(exported.materials).length} materials -> ${presetPath}` +
      ` (${completed} texture transforms completed from raw/)`,
  );
  const unmatched = [...names].filter((name) => !preset.materials[name]);
  if (unmatched.length > 0) {
    console.warn(`[preset] glb materials without a preset entry: ${unmatched.join(', ')}`);
  }
  for (const line of await rebuildFurLayers(glbPath, preset)) console.log(`[fur] ${line}`);
}

for (const actor of actors) {
  const actorDir = path.join(src, actor);
  const outDir = path.join(out, actor);
  const glbPath = path.join(outDir, `${actor}.glb`);
  const texDir = path.join(outDir, 'textures');
  const clipsDir = path.join(outDir, 'clips');
  console.log(`\n=== ${actor} ===`);

  try {
    const { fbx, kind } = findActorFbx(actorDir, actor);
    const materials = readExportMaterials(actorDir, kind);

    if (presetOnly) {
      await writePreset(materials, texDir, glbPath, outDir);
      continue;
    }
    if (clipsOnly) {
      const ok = await convertClips(path.join(actorDir, 'clips'), glbPath, fbx, clipsDir, actor);
      failed = failed || !ok;
      continue;
    }

    console.log(
      `[convert] fbx: ${fbx} (${Object.keys(materials.exported.materials).length} materials in the export)`,
    );
    resetDir(outDir);

    const blenderError = runBlender(fbx, glbPath);
    if (blenderError !== undefined) {
      console.error(`[convert] blender failed for ${actor}:\n${blenderError}`);
      failed = true;
      continue;
    }
    for (const line of await slotUvSets(glbPath)) console.log(`[uv] ${line}`);

    const { copied, converted } = copyTextures(path.join(actorDir, 'textures'), texDir);
    console.log(
      `[convert] copied ${copied} textures (${converted} TGA-mislabeled, converted to PNG)`,
    );

    const { assigned } = await embedBaseColor(glbPath, materials.exported, texDir);
    console.log(`[convert] embedded ${assigned} baseColor textures`);

    await writePreset(materials, texDir, glbPath, outDir);

    const lighting = path.join(actorDir, 'lighting.json');
    if (fs.existsSync(lighting)) {
      fs.copyFileSync(lighting, path.join(outDir, 'lighting.json'));
    }

    const problems = await verifyGlb(glbPath);
    if (problems.length > 0) {
      console.error(`[verify] FAILED:\n  ${problems.join('\n  ')}`);
      failed = true;
    } else {
      console.log('[verify] OK');
    }

    const clipsOk = await convertClips(path.join(actorDir, 'clips'), glbPath, fbx, clipsDir, actor);
    failed = failed || !clipsOk;
  } catch (error) {
    console.error(`[convert] ${actor}: ${error instanceof Error ? error.message : error}`);
    failed = true;
  }
}

if (!presetOnly && (chars.length === 0 || clipsOnly)) {
  const commonOk = await convertCommonClips(src, out);
  failed = failed || !commonOk;
}

process.exit(failed ? 1 : 0);
