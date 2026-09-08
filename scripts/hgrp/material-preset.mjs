/**
 * The character's preset.json: the export's material set, completed for the engine.
 *
 * The export (AnimeStudio CLI over the client data) writes preset.json in the engine's own
 * schema — per material: shader, textures (slot -> file), floats, ints, colors, plus the
 * material object's keywords, render queue, disabled passes and tags — and it is the material
 * ground truth the engine consumes; nothing here re-derives a value it carries. Two things are
 * done to it:
 *
 *   - it is scoped to the materials the converted GLB references (the postmodel exports carry
 *     every LOD's `M_actor_lod_*` material; a material no mesh joins to is dead weight in a
 *     file the web client fetches per character);
 *   - texture tiling and offset are completed from the Unity material objects the export ships
 *     beside it (`raw/materials_<model>/*.json`, AssetRipper shape: m_TexEnvs[slot].m_Scale /
 *     m_Offset), as `colors["<slot>_ST"] = [sx, sy, ox, oy]` for every slot whose transform is
 *     not the identity — the one field the export does not write yet. The hair line map
 *     (6-15x along u) and the fur base map (6x5) are the ones that differ. An `_ST` the export
 *     does write is kept and checked against the material object.
 */

import fs from 'node:fs';
import path from 'node:path';

// Every Unity material JSON in a directory, keyed by material name. The export names the files
// `<material>_p<hash>.json`; the name inside the object is the one the GLB's materials carry.
export function readRawMaterials(rawDir) {
  const materials = new Map();
  for (const file of fs.readdirSync(rawDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
    const name = data.Name || data.m_Name;
    if (!name) throw new Error(`${file}: material object carries no name`);
    materials.set(name, data);
  }
  return materials;
}

function textureTransforms(rawMaterial) {
  const transforms = {};
  for (const [slot, env] of Object.entries(rawMaterial?.m_SavedProperties?.m_TexEnvs ?? {})) {
    if (!env?.m_Texture?.Name) continue;
    const scale = env.m_Scale ?? { X: 1, Y: 1 };
    const offset = env.m_Offset ?? { X: 0, Y: 0 };
    if (scale.X !== 1 || scale.Y !== 1 || offset.X !== 0 || offset.Y !== 0) {
      transforms[`${slot}_ST`] = [scale.X, scale.Y, offset.X, offset.Y];
    }
  }
  return transforms;
}

export function completePreset(exported, rawMaterials, texDir, glbMaterialNames) {
  const materials = {};
  let completed = 0;
  for (const name of Object.keys(exported.materials).sort()) {
    if (!glbMaterialNames.has(name)) continue;
    const material = structuredClone(exported.materials[name]);
    material.colors ??= {};

    for (const [slot, filename] of Object.entries(material.textures ?? {})) {
      if (!fs.existsSync(path.join(texDir, filename))) {
        console.warn(`[preset] ${name}: texture not in local set: ${filename} (${slot})`);
      }
    }

    const raw = rawMaterials.get(name);
    if (!raw) {
      console.warn(`[preset] ${name}: no material object in raw/, texture tiling left at identity`);
    } else {
      for (const [key, value] of Object.entries(textureTransforms(raw))) {
        const shipped = material.colors[key];
        if (shipped === undefined) {
          material.colors[key] = value;
          completed++;
        } else if (JSON.stringify(shipped) !== JSON.stringify(value)) {
          console.warn(
            `[preset] ${name}.${key}: export says ${JSON.stringify(shipped)}, material object ${JSON.stringify(value)}`,
          );
        }
      }
    }
    materials[name] = material;
  }
  return {
    preset: {
      schemaVersion: exported.schemaVersion ?? 1,
      character: exported.character,
      materials,
    },
    completed,
  };
}
