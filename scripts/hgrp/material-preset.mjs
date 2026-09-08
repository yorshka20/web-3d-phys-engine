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
    const colors = {};
    for (const [slot, env] of Object.entries(props.m_TexEnvs ?? {})) {
      const texName = env?.m_Texture?.Name;
      if (!texName) continue;
      textures[slot] = `${texName}.png`;
      if (!fs.existsSync(path.join(texDir, `${texName}.png`))) {
        console.warn(`[preset] ${name}: texture not in local set: ${texName}.png (${slot})`);
      }
      // Tiling and offset ride along as `<slot>_ST`, the shader's own vector for them, only
      // when they are not the identity: the engine's _ST fields default to (1, 1, 0, 0), and
      // the hair line map (6-9x along u) and the fur base map (6x5) are the ones that differ.
      const scale = env.m_Scale ?? { X: 1, Y: 1 };
      const offset = env.m_Offset ?? { X: 0, Y: 0 };
      if (scale.X !== 1 || scale.Y !== 1 || offset.X !== 0 || offset.Y !== 0) {
        colors[`${slot}_ST`] = [scale.X, scale.Y, offset.X, offset.Y];
      }
    }

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
