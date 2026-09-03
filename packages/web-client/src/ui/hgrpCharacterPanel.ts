import { SkeletonComponent } from '@ecs';
import { GLTFAnimation, GLTFModel } from '@renderer/assets/GltfModel';
import {
  HGRP_SHADING_SCHEMA_VERSION,
  HGRP_TUNABLE_COLORS,
  HGRP_TUNABLE_FLOATS,
  hgrpOptionalLayerFlag,
  hgrpRefreshPermutation,
  HGRPCharacterFlags,
  HGRPMaterialDescriptor,
} from '@renderer/material/hgrp';
import { assetRegistry } from '@renderer/webGPU/core/AssetRegistry';
import { FolderApi, Pane } from 'tweakpane';
import {
  applyHGRPPlacement,
  hgrpStage,
  HGRPStageCharacter,
  onHGRPStageChange,
  resetHGRPPlacement,
} from '../stages/hgrp/characters';
import type { DebugTab } from './debugPanel';
import { lazyFolder } from './lazyFolder';

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
// _EnableOutline every frame) — so mutation is the whole update mechanism. A static gate
// (_UseBumpMap, _UseMatcap, ...) is the one exception: it selects the shader permutation, so
// after a float edit the descriptor's permutation is re-resolved (hgrpRefreshPermutation) and
// the material lands on another shader module and pipeline at its next draw.
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
    console.warn('[hgrpCharacterPanel] state has no materials object, skipped');
    return;
  }
  if (state.schemaVersion !== HGRP_SHADING_SCHEMA_VERSION) {
    console.warn(
      `[hgrpCharacterPanel] schemaVersion ${state.schemaVersion} != ${HGRP_SHADING_SCHEMA_VERSION}, merging tolerantly`,
    );
  }
  const byName = new Map(materials.map((m) => [m.materialName, m]));
  const floatKeys = new Set(HGRP_TUNABLE_FLOATS.map((def) => def.key));
  const colorKeys = new Set(HGRP_TUNABLE_COLORS.map((def) => def.key));
  for (const [materialName, override] of Object.entries(state.materials)) {
    const material = byName.get(materialName);
    if (!material) {
      console.warn(`[hgrpCharacterPanel] unknown material "${materialName}" dropped`);
      continue;
    }
    for (const [key, value] of Object.entries(override.floats ?? {})) {
      if (!floatKeys.has(key) || typeof value !== 'number' || !Number.isFinite(value)) {
        console.warn(`[hgrpCharacterPanel] ${materialName}: float "${key}" dropped`);
        continue;
      }
      material.floats[key] = value;
    }
    hgrpRefreshPermutation(material);
    for (const [key, value] of Object.entries(override.colors ?? {})) {
      if (!colorKeys.has(key) || !Array.isArray(value) || value.length !== 4) {
        console.warn(`[hgrpCharacterPanel] ${materialName}: color "${key}" dropped`);
        continue;
      }
      material.colors[key] = [value[0], value[1], value[2], value[3]];
    }
  }
}

// Every (material, key) whose applied value differs from the preset's, as "material.key: preset -> override".
function describeOverrides(pristine: HGRPShadingState, applied: HGRPShadingState): string[] {
  const lines: string[] = [];
  for (const [materialName, before] of Object.entries(pristine.materials)) {
    const after = applied.materials[materialName];
    if (!after) continue;
    for (const [key, value] of Object.entries(before.floats)) {
      if (after.floats[key] !== value) {
        lines.push(`${materialName}.${key}: ${value} -> ${after.floats[key]}`);
      }
    }
    for (const [key, value] of Object.entries(before.colors)) {
      if (after.colors[key].some((c, i) => c !== value[i])) {
        lines.push(
          `${materialName}.${key}: [${value.join(', ')}] -> [${after.colors[key].join(', ')}]`,
        );
      }
    }
  }
  return lines;
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
      console.error('[hgrpCharacterPanel] Failed to import state:', error);
    }
  };
  input.click();
}

/**
 * The Character tab: one folder per character on stage, holding everything that belongs to
 * that character — where it stands, which clip it plays, its optional material layers, and
 * its per-material calibration with its own save/export/reset (the overrides are per
 * character, localStorage key included, so two characters are calibrated independently).
 * Anything shared by the whole scene lives in the Stage tab instead.
 *
 * Only the parameters a material actually declares get a widget. The preset's own key set
 * is the reflection: the binder falls back to a default for an absent key, so drawing a
 * slider for it would invite calibrating a value the material never carries — and the VFX
 * variant, whose vocabulary is disjoint from the CharacterNPR family's, would otherwise
 * show a full set of controls that do nothing.
 */
export function createHGRPCharacterTab(): DebugTab {
  return {
    id: 'hgrp-character',
    label: 'Character',
    mount: mountPane,
  };
}

function mountPane(container: HTMLElement, onVisibleFrame: (tick: () => void) => void): () => void {
  const pane = new Pane({ container });
  const built = new Set<string>();
  const scrubs: (() => void)[] = [];

  // A character joins the stage whenever its Stage-tab checkbox is switched on, so sections
  // are appended as they load rather than built once: rebuilding the pane would throw away
  // the folder state the user just arranged on the characters already there.
  const sync = () => {
    for (const character of hgrpStage.characters) {
      if (!character.entity || built.has(character.assetId)) {
        continue;
      }
      built.add(character.assetId);
      addCharacterFolder(pane, character, built.size === 1, (scrub) => scrubs.push(scrub));
    }
  };
  sync();
  const unsubscribe = onHGRPStageChange(sync);

  // Playback advances outside the panel, so the time scrub follows the clip. Only the scrub
  // binding repaints — a whole-pane refresh would repaint every material slider of every
  // character on stage, thousands of widgets once the roster fills up.
  onVisibleFrame(() => {
    for (const refresh of scrubs) {
      refresh();
    }
  });

  return () => {
    unsubscribe();
    pane.dispose();
  };
}

// The preset values the asset was loaded with, captured the first time the character is seen
// and kept for the session. The panel mutates the live descriptors, so a snapshot taken on a
// later mount would record the user's own edits as if they were the preset, and "Reset to
// preset" would then reset to them.
const presetBaselines = new Map<string, HGRPShadingState>();

function presetBaseline(character: HGRPStageCharacter, materials: HGRPMaterialDescriptor[]) {
  const cached = presetBaselines.get(character.assetId);
  if (cached) {
    return cached;
  }
  const pristine = snapshotState(materials);
  presetBaselines.set(character.assetId, pristine);
  try {
    const stored = localStorage.getItem(`hgrp-shading-${character.assetId}`);
    if (stored) {
      applyState(materials, JSON.parse(stored) as HGRPShadingState);
    }
  } catch (error) {
    console.warn('[hgrpCharacterPanel] Ignoring unreadable localStorage state:', error);
  }
  // Saved overrides shape the render from the moment this tab opens, which is invisible in
  // the picture itself and easy to mistake for the preset's own look — say so, and list
  // exactly what departs from the preset, so a character is never judged against hidden
  // hand-tuned values ("Reset to preset" drops them).
  const overrides = describeOverrides(pristine, snapshotState(materials));
  if (overrides.length > 0) {
    console.warn(
      `[hgrpCharacterPanel] ${character.assetId}: ${overrides.length} saved override(s) applied over the preset:\n  ` +
        overrides.join('\n  '),
    );
  }
  return pristine;
}

function addCharacterFolder(
  pane: Pane,
  character: HGRPStageCharacter,
  expanded: boolean,
  registerScrub: (scrub: () => void) => void,
): void {
  const materials = collectHGRPMaterials(character.assetId);
  const storageKey = `hgrp-shading-${character.assetId}`;
  const pristine = presetBaseline(character, materials);
  const edited = describeOverrides(pristine, snapshotState(materials)).length > 0;
  if (materials.length === 0) {
    console.warn(
      `[hgrpCharacterPanel] no HGRP materials on asset "${character.assetId}", section skipped`,
    );
  }

  lazyFolder(
    pane,
    {
      title: character.label + (edited ? ' · OVERRIDES' : ''),
      key: `hgrp:${character.assetId}`,
      expanded,
    },
    (folder) => {
      addTransformWidgets(folder, character);
      addAnimationWidgets(folder, character, registerScrub);
      if (materials.length > 0) {
        addMaterialWidgets(folder, character, materials, pristine, storageKey);
      }
    },
  );
}

function addTransformWidgets(folder: FolderApi, character: HGRPStageCharacter): void {
  lazyFolder(
    folder,
    { title: 'Transform', key: `hgrp:${character.assetId}:transform` },
    (transform) => {
      const apply = () => applyHGRPPlacement(character);
      for (const axis of ['x', 'y', 'z'] as const) {
        transform
          .addBinding(character.offset, axis, { label: `offset ${axis}`, step: 0.05 })
          .on('change', apply);
      }
      for (const axis of ['x', 'y', 'z'] as const) {
        transform
          .addBinding(character.rotation, axis, {
            label: `rotate ${axis}`,
            min: -180,
            max: 180,
            step: 1,
          })
          .on('change', apply);
      }
      transform
        .addBinding(character, 'scale', { min: 0.1, max: 10, step: 0.05 })
        .on('change', apply);
      transform.addButton({ title: 'Reset placement' }).on('click', () => {
        resetHGRPPlacement(character);
        transform.refresh();
      });
    },
  );
}

// The clips a character can play come from its glTF document (converted Unity clips,
// scripts/hgrp/anim-convert.mjs); a model without clips gets no playback widgets.
function animationClips(assetId: string): GLTFAnimation[] {
  const model = assetRegistry.getAssetDescriptor<'gltf'>(assetId)?.rawData as GLTFModel | undefined;
  return model?.animations ?? [];
}

// Playback widgets bind straight to the entity's SkeletonComponent, which
// SkeletalAnimationSystem reads every frame, so writing the field is the whole update.
// The per-frame scrub repaint is handed to `registerScrub` when the folder is built, which
// is not necessarily now — a folder the user left collapsed builds on its next expand.
function addAnimationWidgets(
  folder: FolderApi,
  character: HGRPStageCharacter,
  registerScrub: (scrub: () => void) => void,
): void {
  const skeleton = character.entity?.getComponent<SkeletonComponent>(
    SkeletonComponent.componentName,
  );
  const clips = animationClips(character.assetId);
  if (!skeleton || clips.length === 0) {
    return;
  }

  lazyFolder(
    folder,
    { title: 'Animation', key: `hgrp:${character.assetId}:animation`, expanded: true },
    (animation) => {
      const options = Object.fromEntries(
        clips.map((clip, index) => [
          `${index}: ${clip.name} (${clip.duration.toFixed(2)}s)`,
          index,
        ]),
      );
      animation.addBinding(skeleton, 'clipIndex', { label: 'clip', options }).on('change', (ev) => {
        if (ev.last) {
          skeleton.time = 0;
          rebuildScrub();
        }
      });
      animation.addBinding(skeleton, 'playing');
      animation.addBinding(skeleton, 'loop');
      animation.addBinding(skeleton, 'speed', { min: -2, max: 3, step: 0.05 });

      // The scrub slider spans the current clip; a clip change rebuilds it with the new
      // duration (tweakpane bindings take their range at creation).
      let scrub = addScrub();
      function addScrub() {
        const duration = clips[skeleton!.clipIndex]?.duration ?? 0;
        return animation.addBinding(skeleton!, 'time', {
          min: 0,
          max: Math.max(duration, 0.001),
          step: 0.001,
        });
      }
      function rebuildScrub() {
        scrub.dispose();
        scrub = addScrub();
      }
      // A paused clip is the case where the user is dragging the scrub themselves; repainting
      // it then would fight the drag.
      registerScrub(() => {
        if (skeleton.playing) {
          scrub.refresh();
        }
      });
    },
  );
}

function addMaterialWidgets(
  folder: FolderApi,
  character: HGRPStageCharacter,
  materials: HGRPMaterialDescriptor[],
  pristine: HGRPShadingState,
  storageKey: string,
): void {
  lazyFolder(
    folder,
    { title: 'Materials', key: `hgrp:${character.assetId}:materials` },
    (section) => {
      // Optional layers this character actually has (HGRPCharacterFlags). The toggle flips the
      // descriptors the draw list already reads every frame, so it takes effect immediately;
      // it is session-only, since the load-time source of truth is the flag passed to
      // loadHGRPCharacter. A character with no gated layer gets no dead switch.
      const gated = new Map<keyof HGRPCharacterFlags, HGRPMaterialDescriptor[]>();
      for (const material of materials) {
        const flag = hgrpOptionalLayerFlag(material.variant);
        if (!flag) continue;
        const group = gated.get(flag) ?? [];
        group.push(material);
        gated.set(flag, group);
      }
      for (const [flag, layers] of gated) {
        const state = { [flag]: layers.every((layer) => layer.enabled) } as Record<string, boolean>;
        section.addBinding(state, flag).on('change', () => {
          for (const layer of layers) {
            layer.enabled = state[flag];
          }
        });
      }

      // Persistence is EXPLICIT ('Save overrides' button): live tweaks are session-only, so
      // experiments never silently shadow the authoritative preset values across reloads.
      const persist = () => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(snapshotState(materials)));
        } catch (error) {
          console.warn('[hgrpCharacterPanel] Failed to persist to localStorage:', error);
        }
      };

      // Widget value objects mirror the descriptors; syncers pull descriptor -> widget after a
      // bulk apply (import/reset), then one section.refresh() repaints everything. A material
      // folder that was never expanded has neither widgets nor a syncer — it reads the
      // descriptors when it is finally built, which is the same value a syncer would have put
      // there.
      const syncers: (() => void)[] = [];

      for (const material of materials) {
        const floatDefs = HGRP_TUNABLE_FLOATS.filter((def) => def.key in material.floats);
        const colorDefs = HGRP_TUNABLE_COLORS.filter((def) => def.key in material.colors);
        if (floatDefs.length === 0 && colorDefs.length === 0) {
          continue;
        }

        const title = `${material.materialName} · ${material.variant.replace('CharacterNPR', 'NPR')}`;
        const key = `hgrp:${character.assetId}:material:${material.materialName}`;
        lazyFolder(section, { title, key }, (materialFolder) => {
          const floatValues: Record<string, number> = {};
          for (const def of floatDefs) {
            floatValues[def.key] = material.floats[def.key] ?? def.default;
            materialFolder
              .addBinding(floatValues, def.key, {
                label: def.key.slice(1),
                min: def.min,
                max: def.max,
                step: def.step,
              })
              .on('change', (ev) => {
                material.floats[def.key] = ev.value as number;
                hgrpRefreshPermutation(material);
              });
          }
          syncers.push(() => {
            for (const def of floatDefs) {
              floatValues[def.key] = material.floats[def.key] ?? def.default;
            }
          });

          const colorValues: Record<string, { r: number; g: number; b: number; a: number }> = {};
          for (const def of colorDefs) {
            const current = material.colors[def.key] ?? def.default;
            colorValues[def.key] = { r: current[0], g: current[1], b: current[2], a: current[3] };
            materialFolder
              .addBinding(colorValues, def.key, {
                label: def.key.slice(1),
                color: { type: 'float' },
              })
              .on('change', (ev) => {
                const c = ev.value as { r: number; g: number; b: number; a: number };
                material.colors[def.key] = [c.r, c.g, c.b, c.a];
              });
          }
          syncers.push(() => {
            for (const def of colorDefs) {
              const current = material.colors[def.key] ?? def.default;
              colorValues[def.key] = { r: current[0], g: current[1], b: current[2], a: current[3] };
            }
          });
        });
      }

      const syncWidgets = () => {
        for (const sync of syncers) {
          sync();
        }
        section.refresh();
      };

      section.addButton({ title: 'Save overrides' }).on('click', () => persist());
      section.addButton({ title: 'Export JSON' }).on('click', () => {
        exportState(snapshotState(materials), character.assetId);
      });
      section.addButton({ title: 'Import JSON' }).on('click', () =>
        importState((imported) => {
          applyState(materials, imported);
          syncWidgets();
        }),
      );
      section.addButton({ title: 'Reset to preset' }).on('click', () => {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // storage unavailable — reset still applies in-memory
        }
        applyState(materials, pristine);
        syncWidgets();
      });
    },
  );
}
