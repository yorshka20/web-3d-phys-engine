import { globalContainer, ServiceTokens } from '@renderer/webGPU/core/decorators/DIContainer';
import {
  PMX_SHADING_PARAM_SCHEMA,
  PMX_SHADING_SCHEMA_VERSION,
  ShadingParamsManager,
} from '@renderer/webGPU/core/ShadingParamsManager';
import { Pane } from 'tweakpane';
import { DebugTab } from './debugTabs';
import preset from '../presets/pmx-shading.json';

const STORAGE_KEY = 'pmx-shading-params';

interface ShadingPreset {
  schemaVersion: number;
  values: Record<string, number>;
}

// Layered value resolution: schema defaults <- tracked preset (the committed look)
// <- localStorage (per-browser WIP overlay). The preset file is the source of truth;
// localStorage only carries uncommitted tweaks across reloads.
function loadInitialValues(): Record<string, number> {
  const values: Record<string, number> = {};
  for (const def of PMX_SHADING_PARAM_SCHEMA) {
    values[def.key] = def.default;
  }
  mergePreset(values, preset as ShadingPreset, 'preset file');
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      mergePreset(values, JSON.parse(stored) as ShadingPreset, 'localStorage');
    }
  } catch (error) {
    console.warn('[shadingPanel] Ignoring unreadable localStorage state:', error);
  }
  return values;
}

function mergePreset(target: Record<string, number>, source: ShadingPreset, origin: string): void {
  if (!source || typeof source !== 'object' || typeof source.values !== 'object') {
    console.warn(`[shadingPanel] ${origin} has no values object, skipped`);
    return;
  }
  if (source.schemaVersion !== PMX_SHADING_SCHEMA_VERSION) {
    console.warn(
      `[shadingPanel] ${origin} schemaVersion ${source.schemaVersion} != ${PMX_SHADING_SCHEMA_VERSION}, merging tolerantly`,
    );
  }
  for (const [key, value] of Object.entries(source.values)) {
    if (!(key in target)) {
      console.warn(`[shadingPanel] ${origin}: unknown param "${key}" dropped`);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      console.warn(`[shadingPanel] ${origin}: non-numeric value for "${key}" dropped`);
      continue;
    }
    target[key] = value;
  }
}

function saveToLocalStorage(values: Record<string, number>): void {
  try {
    const state: ShadingPreset = { schemaVersion: PMX_SHADING_SCHEMA_VERSION, values };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[shadingPanel] Failed to persist to localStorage:', error);
  }
}

function exportPreset(values: Record<string, number>): void {
  const state: ShadingPreset = { schemaVersion: PMX_SHADING_SCHEMA_VERSION, values };
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'pmx-shading.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function importPreset(onLoaded: (imported: ShadingPreset) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      onLoaded(JSON.parse(await file.text()) as ShadingPreset);
    } catch (error) {
      console.error('[shadingPanel] Failed to import preset:', error);
    }
  };
  input.click();
}

/**
 * Mount the PMX shading tuning panel (toggle with G). Must be called after game.initialize()
 * so the renderer's DI container holds the ShadingParamsManager instance.
 */
export function createPMXShadingTab(): DebugTab {
  return { id: 'pmx-shading', label: 'PMX', mount: mountPane };
}

function mountPane(container: HTMLElement): () => void {
  const manager = globalContainer.resolve<ShadingParamsManager>(
    ServiceTokens.SHADING_PARAMS_MANAGER,
  );

  const values = loadInitialValues();
  manager.setParams(values);

  const pane = new Pane({ container });

  for (const def of PMX_SHADING_PARAM_SCHEMA) {
    pane
      .addBinding(values, def.key, {
        label: def.label,
        min: def.min,
        max: def.max,
        step: def.step,
      })
      .on('change', (ev) => {
        manager.setParam(def.key, ev.value as number);
        saveToLocalStorage(values);
      });
  }

  const applyAll = () => {
    manager.setParams(values);
    saveToLocalStorage(values);
    pane.refresh();
  };

  pane.addButton({ title: 'Export JSON' }).on('click', () => exportPreset(values));
  pane.addButton({ title: 'Import JSON' }).on('click', () =>
    importPreset((imported) => {
      mergePreset(values, imported, 'imported file');
      applyAll();
    }),
  );
  pane.addButton({ title: 'Reset to preset' }).on('click', () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — reset still applies in-memory
    }
    for (const def of PMX_SHADING_PARAM_SCHEMA) {
      values[def.key] = def.default;
    }
    mergePreset(values, preset as ShadingPreset, 'preset file');
    manager.setParams(values);
    pane.refresh();
  });

  return () => pane.dispose();
}
