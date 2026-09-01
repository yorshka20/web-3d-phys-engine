import { GLTFModel } from '@renderer/assets/GltfModel';
import {
  HGRP_SHADING_SCHEMA_VERSION,
  HGRP_TUNABLE_COLORS,
  HGRP_TUNABLE_FLOATS,
  HGRPMaterialDescriptor,
} from '@renderer/material/hgrp';
import { assetRegistry } from '@renderer/webGPU/core/AssetRegistry';
import { tonemapSettings } from '@renderer/webGPU/renderer/passes/TonemapPass';
import { sceneSettings } from '@renderer/webGPU/renderer/sceneSettings';
import { Pane } from 'tweakpane';

// Per-material calibration overrides for one HGRP character, keyed by material name.
interface HGRPShadingState {
  schemaVersion: number;
  materials: Record<
    string,
    {
      floats: Record<string, number>;
      colors: Record<string, number[]>;
    }
  >;
}

// The GUI edits the LIVE material descriptors: the same objects flow by reference from the
// loaded GLTFModel through RenderData into MaterialBinder, which re-packs the material
// uniform from descriptor floats/colors every frame (and DrawListBuilder re-reads
// _EnableOutline every frame) — so mutation is the whole update mechanism.
function collectHGRPMaterials(assetId: string): HGRPMaterialDescriptor[] {
  const descriptor = assetRegistry.getAssetDescriptor<'gltf'>(assetId);
  const model = descriptor?.rawData as GLTFModel | undefined;
  if (!model) {
    return [];
  }
  const byKey = new Map<string, HGRPMaterialDescriptor>();
  for (const mesh of model.meshes) {
    for (const primitive of mesh.primitives) {
      const material = primitive.material;
      if (material && material.materialType === 'hgrp') {
        byKey.set(material.materialKey, material as HGRPMaterialDescriptor);
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.materialName < b.materialName ? -1 : a.materialName > b.materialName ? 1 : 0,
  );
}

// Effective values for every tunable key (schema defaults mirror the binder fallbacks, so a
// missing preset key snapshots to the value the shader is already seeing).
function snapshotState(materials: HGRPMaterialDescriptor[]): HGRPShadingState {
  const state: HGRPShadingState = { schemaVersion: HGRP_SHADING_SCHEMA_VERSION, materials: {} };
  for (const material of materials) {
    const floats: Record<string, number> = {};
    const colors: Record<string, number[]> = {};
    for (const def of HGRP_TUNABLE_FLOATS) {
      floats[def.key] = material.floats[def.key] ?? def.default;
    }
    for (const def of HGRP_TUNABLE_COLORS) {
      colors[def.key] = [...(material.colors[def.key] ?? def.default)];
    }
    state.materials[material.materialName] = { floats, colors };
  }
  return state;
}

// Tolerant merge into the live descriptors: unknown materials/keys are skipped with a warning
// so stale saved state survives schema evolution.
function applyState(materials: HGRPMaterialDescriptor[], state: HGRPShadingState): void {
  if (!state || typeof state !== 'object' || typeof state.materials !== 'object') {
    console.warn('[hgrpShadingPanel] state has no materials object, skipped');
    return;
  }
  if (state.schemaVersion !== HGRP_SHADING_SCHEMA_VERSION) {
    console.warn(
      `[hgrpShadingPanel] schemaVersion ${state.schemaVersion} != ${HGRP_SHADING_SCHEMA_VERSION}, merging tolerantly`,
    );
  }
  const byName = new Map(materials.map((m) => [m.materialName, m]));
  const floatKeys = new Set(HGRP_TUNABLE_FLOATS.map((def) => def.key));
  const colorKeys = new Set(HGRP_TUNABLE_COLORS.map((def) => def.key));
  for (const [materialName, override] of Object.entries(state.materials)) {
    const material = byName.get(materialName);
    if (!material) {
      console.warn(`[hgrpShadingPanel] unknown material "${materialName}" dropped`);
      continue;
    }
    for (const [key, value] of Object.entries(override.floats ?? {})) {
      if (!floatKeys.has(key) || typeof value !== 'number' || !Number.isFinite(value)) {
        console.warn(`[hgrpShadingPanel] ${materialName}: float "${key}" dropped`);
        continue;
      }
      material.floats[key] = value;
    }
    for (const [key, value] of Object.entries(override.colors ?? {})) {
      if (!colorKeys.has(key) || !Array.isArray(value) || value.length !== 4) {
        console.warn(`[hgrpShadingPanel] ${materialName}: color "${key}" dropped`);
        continue;
      }
      material.colors[key] = [value[0], value[1], value[2], value[3]];
    }
  }
}

function exportState(state: HGRPShadingState, assetId: string): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${assetId}-shading.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importState(onLoaded: (imported: HGRPShadingState) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      onLoaded(JSON.parse(await file.text()) as HGRPShadingState);
    } catch (error) {
      console.error('[hgrpShadingPanel] Failed to import state:', error);
    }
  };
  input.click();
}

/**
 * Mount the HGRP material calibration panel (toggle with H). Enumerates the live HGRP
 * material descriptors of one loaded character asset and edits them in place; the preset
 * stays authoritative — the panel layers a localStorage WIP overlay on top, with
 * export/import for handing calibrated values back to the preset pipeline.
 * No-op when the asset holds no HGRP materials.
 */
export function mountHGRPShadingPanel(assetId: string) {
  const materials = collectHGRPMaterials(assetId);
  if (materials.length === 0) {
    console.warn(`[hgrpShadingPanel] no HGRP materials on asset "${assetId}", panel not mounted`);
    return () => {};
  }

  const storageKey = `hgrp-shading-${assetId}`;
  const pristine = snapshotState(materials);
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      applyState(materials, JSON.parse(stored) as HGRPShadingState);
    }
  } catch (error) {
    console.warn('[hgrpShadingPanel] Ignoring unreadable localStorage state:', error);
  }

  const host = document.createElement('div');
  host.id = 'hgrp-shading-panel-host';
  host.style.cssText =
    'position: fixed; top: 10px; right: 10px; z-index: 1000; width: 320px; ' +
    'max-height: calc(100vh - 20px); overflow-y: auto;';
  host.hidden = true;
  document.body.appendChild(host);

  const pane = new Pane({ container: host, title: 'HGRP Shading (H)' });

  // Global linear-light exposure ahead of the ACES curve and the scene backdrop color
  // (session-only calibration knobs, not part of the per-material preset state)
  const globalFolder = pane.addFolder({ title: 'Scene (global)', expanded: true });
  globalFolder.addBinding(tonemapSettings, 'exposure', { min: 0.1, max: 4, step: 0.01 });
  const backdrop = {
    clearColor: {
      r: sceneSettings.clearColor[0],
      g: sceneSettings.clearColor[1],
      b: sceneSettings.clearColor[2],
    },
  };
  globalFolder
    .addBinding(backdrop, 'clearColor', { label: 'backdrop', color: { type: 'float' } })
    .on('change', (ev) => {
      sceneSettings.clearColor = [ev.value.r, ev.value.g, ev.value.b];
    });

  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshotState(materials)));
    } catch (error) {
      console.warn('[hgrpShadingPanel] Failed to persist to localStorage:', error);
    }
  };

  // Widget value objects mirror the descriptors; syncers pull descriptor -> widget after a
  // bulk apply (import/reset), then one pane.refresh() repaints everything.
  const syncers: (() => void)[] = [];

  for (const material of materials) {
    const folder = pane.addFolder({
      title: `${material.materialName} · ${material.variant.replace('CharacterNPR', 'NPR')}`,
      expanded: false,
    });

    const floatValues: Record<string, number> = {};
    for (const def of HGRP_TUNABLE_FLOATS) {
      floatValues[def.key] = material.floats[def.key] ?? def.default;
      folder
        .addBinding(floatValues, def.key, {
          label: def.key.slice(1),
          min: def.min,
          max: def.max,
          step: def.step,
        })
        .on('change', (ev) => {
          material.floats[def.key] = ev.value as number;
          persist();
        });
    }
    syncers.push(() => {
      for (const def of HGRP_TUNABLE_FLOATS) {
        floatValues[def.key] = material.floats[def.key] ?? def.default;
      }
    });

    const colorValues: Record<string, { r: number; g: number; b: number; a: number }> = {};
    for (const def of HGRP_TUNABLE_COLORS) {
      const current = material.colors[def.key] ?? def.default;
      colorValues[def.key] = { r: current[0], g: current[1], b: current[2], a: current[3] };
      folder
        .addBinding(colorValues, def.key, {
          label: def.key.slice(1),
          color: { type: 'float' },
        })
        .on('change', (ev) => {
          const c = ev.value as { r: number; g: number; b: number; a: number };
          material.colors[def.key] = [c.r, c.g, c.b, c.a];
          persist();
        });
    }
    syncers.push(() => {
      for (const def of HGRP_TUNABLE_COLORS) {
        const current = material.colors[def.key] ?? def.default;
        colorValues[def.key] = { r: current[0], g: current[1], b: current[2], a: current[3] };
      }
    });
  }

  const syncWidgets = () => {
    for (const sync of syncers) {
      sync();
    }
    pane.refresh();
  };

  pane.addButton({ title: 'Export JSON' }).on('click', () => {
    exportState(snapshotState(materials), assetId);
  });
  pane.addButton({ title: 'Import JSON' }).on('click', () =>
    importState((imported) => {
      applyState(materials, imported);
      persist();
      syncWidgets();
    }),
  );
  pane.addButton({ title: 'Reset to preset' }).on('click', () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // storage unavailable — reset still applies in-memory
    }
    applyState(materials, pristine);
    syncWidgets();
  });

  function handleKey(e: KeyboardEvent) {
    if (e.code !== 'KeyH') return;
    const target = e.target as HTMLElement | null;
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    host.hidden = !host.hidden;
  }
  window.addEventListener('keydown', handleKey);

  return () => {
    window.removeEventListener('keydown', handleKey);
    pane.dispose();
    host.remove();
  };
}
