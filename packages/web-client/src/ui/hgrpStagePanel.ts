import { World } from '@ecs/core/ecs/World';
import { bloomSettings } from '@renderer/webGPU/renderer/passes/BloomPass';
import { taaSettings } from '@renderer/webGPU/renderer/passes/TAAPass';
import { tonemapSettings } from '@renderer/webGPU/renderer/passes/TonemapPass';
import {
  HGRP_DEBUG_CHANNELS,
  HGRP_DEBUG_SLOT_NAMES,
  sceneSettings,
} from '@renderer/webGPU/renderer/sceneSettings';
import { Pane } from 'tweakpane';
import {
  applyAllHGRPPlacements,
  hgrpStage,
  setHGRPCharacterVisible,
} from '../stages/hgrp/characters';
import type { DebugTab } from './debugPanel';

// The Stage tab: what the whole scene shares — who stands on it, how big the layout is, the
// lighting and backdrop it is lit by, and the post chain it is graded through. Everything
// that belongs to one character (its placement, its clip, its materials) lives in the
// Character tab instead. Nothing here is persisted: these are session calibration knobs, not
// preset state, because the ripped materials carry no scene light of their own.
export function createHGRPStageTab(world: World): DebugTab {
  return {
    id: 'hgrp-stage',
    label: 'Stage',
    mount: (container) => mountPane(container, world),
  };
}

function mountPane(container: HTMLElement, world: World): () => void {
  const pane = new Pane({ container });

  addCharacterSwitches(pane, world);

  pane
    .addBinding(hgrpStage, 'globalScale', { min: 0.1, max: 20, step: 0.1 })
    .on('change', applyAllHGRPPlacements);

  addLightingWidgets(pane);
  addPostWidgets(pane);

  // The metal look of the cloth hardware zone (_MetallicGlossMap.r = 1.0). metalEnv is the
  // radiance of the environment the metal reflects in its own base color, in the same units as
  // the lighting above: 1 = as bright as full lighting. It is what decides whether the silver
  // hardware reads as metal at all.
  const metal = pane.addFolder({ title: 'Metal (hardware zone)', expanded: false });
  metal.addBinding(sceneSettings, 'metalEnv', { min: 0, max: 4, step: 0.01 });
  metal.addBinding(sceneSettings, 'metalDiffuse', { min: 0, max: 1, step: 0.01 });
  metal.addBinding(sceneSettings, 'metalEdge', { min: 0, max: 4, step: 0.01 });

  // Material debug view: show one texture slot of every HGRP material on the mesh instead of
  // its shading. Magenta = the material's permutation does not bind that slot.
  const debug = pane.addFolder({ title: 'Debug view (textures)', expanded: false });
  debug.addBinding(sceneSettings.debugView, 'slot', {
    options: Object.fromEntries(HGRP_DEBUG_SLOT_NAMES.map((name) => [name, name])),
  });
  debug.addBinding(sceneSettings.debugView, 'channel', {
    options: Object.fromEntries(HGRP_DEBUG_CHANNELS.map((name) => [name, name])),
  });

  return () => pane.dispose();
}

// One switch per converted character under assets/hgrp. Switching one on for the first time
// fetches its model, preset and ~40 textures, which is why the whole roster is not on stage
// from the start: a character costs 200-350 MB of decoded texture data for the session.
// Switching one off hides it and re-packs the row; its assets stay resident.
function addCharacterSwitches(pane: Pane, world: World): void {
  const folder = pane.addFolder({ title: 'Characters', expanded: true });
  const onStage: Record<string, boolean> = {};
  for (const character of hgrpStage.characters) {
    onStage[character.assetId] = character.visible;
    folder.addBinding(onStage, character.assetId, { label: character.label }).on('change', (ev) => {
      setHGRPCharacterVisible(world, character, ev.value).catch((error) => {
        console.error(`[hgrpStagePanel] ${character.label} failed to load:`, error);
        onStage[character.assetId] = false;
        character.visible = false;
        pane.refresh();
      });
    });
  }
}

// Scene lighting: the key light the NPR shading reads and the flat ambient on top of it
// (uploaded per frame as the HGRP SceneLighting uniform), plus the backdrop the characters
// stand against.
function addLightingWidgets(pane: Pane): void {
  const lighting = pane.addFolder({ title: 'Lighting', expanded: true });
  const [dx, dy, dz] = sceneSettings.lightDirection;
  const lightingState = {
    direction: { x: dx, y: dy, z: dz },
    lightColor: rgb(sceneSettings.lightColor),
    ambientColor: rgb(sceneSettings.ambientColor),
    clearColor: rgb(sceneSettings.clearColor),
  };
  const axis = { min: -1, max: 1, step: 0.01 };
  lighting
    .addBinding(lightingState, 'direction', { x: axis, y: axis, z: axis })
    .on('change', (ev) => {
      sceneSettings.lightDirection = [ev.value.x, ev.value.y, ev.value.z];
    });
  lighting.addBinding(sceneSettings, 'lightIntensity', { min: 0, max: 3, step: 0.01 });
  lighting
    .addBinding(lightingState, 'lightColor', { color: { type: 'float' } })
    .on('change', (ev) => {
      sceneSettings.lightColor = [ev.value.r, ev.value.g, ev.value.b];
    });
  lighting.addBinding(sceneSettings, 'ambientIntensity', { min: 0, max: 2, step: 0.01 });
  lighting
    .addBinding(lightingState, 'ambientColor', { color: { type: 'float' } })
    .on('change', (ev) => {
      sceneSettings.ambientColor = [ev.value.r, ev.value.g, ev.value.b];
    });
  lighting.addBinding(sceneSettings, 'envReflection', { min: 0, max: 3, step: 0.01 });
  lighting.addBinding(sceneSettings, 'envGradient', { min: 0, max: 1, step: 0.01 });
  lighting
    .addBinding(lightingState, 'clearColor', { label: 'backdrop', color: { type: 'float' } })
    .on('change', (ev) => {
      sceneSettings.clearColor = [ev.value.r, ev.value.g, ev.value.b];
    });
}

// Global linear-light exposure ahead of the ACES curve, then grading after it and the
// anti-aliasing stages.
function addPostWidgets(pane: Pane): void {
  const post = pane.addFolder({ title: 'Post', expanded: true });
  post.addBinding(tonemapSettings, 'exposure', { min: 0.1, max: 4, step: 0.01 });
  post.addBinding(bloomSettings, 'threshold', {
    label: 'bloomThreshold',
    min: 0,
    max: 4,
    step: 0.01,
  });
  post.addBinding(bloomSettings, 'intensity', {
    label: 'bloomIntensity',
    min: 0,
    max: 1,
    step: 0.01,
  });
  post.addBinding(tonemapSettings, 'contrast', { min: 0.5, max: 2, step: 0.01 });
  post.addBinding(tonemapSettings, 'saturation', { min: 0, max: 2, step: 0.01 });
  post.addBinding(tonemapSettings, 'temperature', { min: -1, max: 1, step: 0.01 });
  post.addBinding(sceneSettings, 'antiAliasing', {
    options: { off: 'off', fxaa: 'fxaa', taa: 'taa', 'taa+fxaa': 'taa+fxaa' },
  });
  post.addBinding(taaSettings, 'blend', { label: 'taaBlend', min: 0.02, max: 0.5, step: 0.01 });
}

function rgb(color: readonly [number, number, number]): { r: number; g: number; b: number } {
  return { r: color[0], g: color[1], b: color[2] };
}
