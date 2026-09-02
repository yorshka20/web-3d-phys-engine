/**
 * Stage A3: AssetRipper Material JSONs -> one HGRP preset.json per character.
 *
 * The preset mirrors the game's material ground truth verbatim (HGRP property names,
 * texture slot -> file, floats/ints/colors) so Stage B's material family consumes real
 * values instead of eye-calibration. LOD material variants are skipped; materials present
 * in the GLB but absent here (common materials not exported per-character) are
 * default-filled by the engine.
 *
 * `glbMaterialNames` scopes the output to what the converted GLB actually references. A
 * character's rip carries every material the game ships for it — Laevatian's is 356
 * non-LOD entries, of which 290 are HGRP/Effect/VFX* — and the preset is statically
 * imported by the web client, so an unscoped preset ships megabytes the renderer can
 * never join to a mesh.
 */

import fs from 'node:fs';
import path from 'node:path';

export function buildPreset(charDir, texDir, charName, glbMaterialNames) {
  const matDir = path.join(charDir, 'Material');
  const materials = {};

  for (const file of fs.readdirSync(matDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const name = path.basename(file, '.json');
    if (name.includes('_lod_')) continue;
    if (glbMaterialNames && !glbMaterialNames.has(name)) continue;

    const data = JSON.parse(fs.readFileSync(path.join(matDir, file), 'utf8'));
    const props = data.m_SavedProperties ?? {};

    const textures = {};
    for (const [slot, env] of Object.entries(props.m_TexEnvs ?? {})) {
      const texName = env?.m_Texture?.Name;
      if (!texName) continue;
      textures[slot] = `${texName}.png`;
      if (!fs.existsSync(path.join(texDir, `${texName}.png`))) {
        console.warn(`[preset] ${name}: texture not in local set: ${texName}.png (${slot})`);
      }
    }

    const colors = {};
    for (const [key, c] of Object.entries(props.m_Colors ?? {})) {
      colors[key] = [c.r, c.g, c.b, c.a];
    }

    materials[name] = {
      shader: data.m_Shader?.Name ?? null,
      textures,
      floats: props.m_Floats ?? {},
      ints: props.m_Ints ?? {},
      colors,
    };
  }

  return { schemaVersion: 1, character: charName, materials };
}
