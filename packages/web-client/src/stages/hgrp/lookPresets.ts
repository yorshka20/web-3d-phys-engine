import { bloomSettings } from '@renderer/webGPU/renderer/passes/BloomPass';
import { taaSettings } from '@renderer/webGPU/renderer/passes/TAAPass';
import { tonemapSettings } from '@renderer/webGPU/renderer/passes/TonemapPass';
import { sceneLights } from '@renderer/webGPU/renderer/sceneLights';
import { AntiAliasingMode, sceneSettings } from '@renderer/webGPU/renderer/sceneSettings';

type Rgb = [number, number, number];

// Everything about the picture that is not a character: the lighting rig the scene settings
// hold, the environment stand-in, the self-shadow and the post chain. One look is one
// calibrated state of these, so a session's dialled-in values can be kept and compared.
export interface HGRPLook {
  lighting: {
    lightDirection: Rgb;
    lightColor: Rgb;
    lightIntensity: number;
    ambientIntensity: number;
    ambientColor: Rgb;
    clearColor: Rgb;
    envRadiance: number;
    envGradient: number;
    shadow: { enabled: boolean; strength: number; depthBias: number; normalBias: number };
    rig: { enabled: boolean; intensityScale: number };
  };
  post: {
    exposure: number;
    antiAliasing: AntiAliasingMode;
    taaBlend: number;
    bloom: {
      threshold: number;
      characterThreshold: number;
      characterIntensity: number;
      intensity: number;
      subtract: number;
      scatter: number;
      tint: Rgb;
      maxIterations: number;
    };
    tonemap: { contrast: number; saturation: number; colorFilter: Rgb };
  };
}

export interface HGRPLookPreset {
  id: string;
  label: string;
  look: HGRPLook;
  // A built-in cannot be deleted or overwritten; a saved one can
  builtin: boolean;
}

const STORAGE_KEY = 'hgrp-looks';
const LOOK_VERSION = 1;

const rgb = (color: readonly number[]): Rgb => [color[0], color[1], color[2]];

/** The look the scene is showing right now. */
export function currentLook(): HGRPLook {
  return {
    lighting: {
      lightDirection: rgb(sceneSettings.lightDirection),
      lightColor: rgb(sceneSettings.lightColor),
      lightIntensity: sceneSettings.lightIntensity,
      ambientIntensity: sceneSettings.ambientIntensity,
      ambientColor: rgb(sceneSettings.ambientColor),
      clearColor: rgb(sceneSettings.clearColor),
      envRadiance: sceneSettings.envRadiance,
      envGradient: sceneSettings.envGradient,
      shadow: { ...sceneSettings.shadow },
      rig: { enabled: sceneLights.enabled, intensityScale: sceneLights.intensityScale },
    },
    post: {
      exposure: sceneSettings.exposure,
      antiAliasing: sceneSettings.antiAliasing,
      taaBlend: taaSettings.blend,
      bloom: {
        threshold: bloomSettings.threshold,
        characterThreshold: bloomSettings.characterThreshold,
        characterIntensity: bloomSettings.characterIntensity,
        intensity: bloomSettings.intensity,
        subtract: bloomSettings.subtract,
        scatter: bloomSettings.scatter,
        tint: rgb(bloomSettings.tint),
        maxIterations: bloomSettings.maxIterations,
      },
      tonemap: {
        contrast: tonemapSettings.contrast,
        saturation: tonemapSettings.saturation,
        colorFilter: rgb(tonemapSettings.colorFilter),
      },
    },
  };
}

/**
 * Put a look on the scene. Tolerant of a partial look (an older save): a missing field keeps
 * its current value, so a saved look never resets what it did not know about.
 */
export function applyLook(look: Partial<HGRPLook>): void {
  const lighting = look.lighting;
  if (lighting) {
    if (lighting.lightDirection) sceneSettings.lightDirection = rgb(lighting.lightDirection);
    if (lighting.lightColor) sceneSettings.lightColor = rgb(lighting.lightColor);
    if (isFinite(lighting.lightIntensity)) sceneSettings.lightIntensity = lighting.lightIntensity;
    if (isFinite(lighting.ambientIntensity)) {
      sceneSettings.ambientIntensity = lighting.ambientIntensity;
    }
    if (lighting.ambientColor) sceneSettings.ambientColor = rgb(lighting.ambientColor);
    if (lighting.clearColor) sceneSettings.clearColor = rgb(lighting.clearColor);
    if (isFinite(lighting.envRadiance)) sceneSettings.envRadiance = lighting.envRadiance;
    if (isFinite(lighting.envGradient)) sceneSettings.envGradient = lighting.envGradient;
    if (lighting.shadow) Object.assign(sceneSettings.shadow, lighting.shadow);
    if (lighting.rig) {
      if (typeof lighting.rig.enabled === 'boolean') sceneLights.enabled = lighting.rig.enabled;
      if (isFinite(lighting.rig.intensityScale)) {
        sceneLights.intensityScale = lighting.rig.intensityScale;
      }
    }
  }
  const post = look.post;
  if (post) {
    if (isFinite(post.exposure)) sceneSettings.exposure = post.exposure;
    if (post.antiAliasing) sceneSettings.antiAliasing = post.antiAliasing;
    if (isFinite(post.taaBlend)) taaSettings.blend = post.taaBlend;
    if (post.bloom) {
      const { tint, ...scalars } = post.bloom;
      Object.assign(bloomSettings, scalars);
      if (tint) bloomSettings.tint = rgb(tint);
    }
    if (post.tonemap) {
      const { colorFilter, ...scalars } = post.tonemap;
      Object.assign(tonemapSettings, scalars);
      if (colorFilter) tonemapSettings.colorFilter = rgb(colorFilter);
    }
  }
}

function isFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// The built-ins are variants of the calibrated default, differing only in the key light and
// the backdrop: the studio look is the default itself, captured at stage start so it is the
// reference whatever the session changed since.
let studio: HGRPLook | undefined;

function variant(changes: (look: HGRPLook) => void): HGRPLook {
  const look = JSON.parse(JSON.stringify(studio ?? currentLook())) as HGRPLook;
  changes(look);
  return look;
}

function builtinPresets(): HGRPLookPreset[] {
  studio ??= currentLook();
  return [
    { id: 'studio', label: 'Studio', builtin: true, look: studio },
    {
      id: 'backlit',
      label: 'Backlit',
      builtin: true,
      look: variant((look) => {
        look.lighting.lightDirection = [0.3, 0.45, -0.84];
        look.lighting.lightIntensity = studio!.lighting.lightIntensity * 1.3;
        look.lighting.clearColor = [0.42, 0.43, 0.47];
      }),
    },
    {
      id: 'overcast',
      label: 'Overcast',
      builtin: true,
      look: variant((look) => {
        look.lighting.lightDirection = [-0.2, 0.9, 0.39];
        look.lighting.lightIntensity = studio!.lighting.lightIntensity * 0.8;
        look.lighting.ambientIntensity = Math.min(1.5, studio!.lighting.ambientIntensity * 1.6);
        look.lighting.clearColor = [0.8, 0.81, 0.84];
      }),
    },
    {
      id: 'night',
      label: 'Night',
      builtin: true,
      look: variant((look) => {
        look.lighting.lightDirection = [0.6, 0.35, 0.72];
        look.lighting.lightColor = [0.75, 0.82, 1];
        look.lighting.ambientColor = [0.7, 0.78, 1];
        look.lighting.clearColor = [0.05, 0.06, 0.09];
      }),
    },
  ];
}

interface StoredLooks {
  version: number;
  looks: { id: string; label: string; look: HGRPLook }[];
}

function readSaved(): StoredLooks['looks'] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredLooks;
    return Array.isArray(parsed.looks) ? parsed.looks : [];
  } catch (error) {
    console.warn('[lookPresets] ignoring unreadable saved looks:', error);
    return [];
  }
}

function writeSaved(looks: StoredLooks['looks']): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: LOOK_VERSION, looks }));
  } catch (error) {
    console.warn('[lookPresets] failed to save looks:', error);
  }
}

const listeners = new Set<() => void>();

export function onLookPresetsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Built-ins first, then the saved looks in save order. */
export function lookPresets(): HGRPLookPreset[] {
  return [...builtinPresets(), ...readSaved().map((entry) => ({ ...entry, builtin: false }))];
}

export function applyLookPreset(id: string): boolean {
  const preset = lookPresets().find((entry) => entry.id === id);
  if (!preset) return false;
  applyLook(preset.look);
  return true;
}

/** Save the current look under a label; a saved look of the same label is replaced. */
export function saveLookPreset(label: string): HGRPLookPreset {
  const trimmed = label.trim() || 'Untitled';
  const id = `saved:${trimmed.toLowerCase().replace(/\s+/g, '-')}`;
  const saved = readSaved().filter((entry) => entry.id !== id);
  const entry = { id, label: trimmed, look: currentLook() };
  saved.push(entry);
  writeSaved(saved);
  notify();
  return { ...entry, builtin: false };
}

export function removeLookPreset(id: string): void {
  const saved = readSaved();
  const remaining = saved.filter((entry) => entry.id !== id);
  if (remaining.length === saved.length) return;
  writeSaved(remaining);
  notify();
}

export function exportLook(label = 'look'): void {
  const blob = new Blob(
    [JSON.stringify({ version: LOOK_VERSION, label, look: currentLook() }, null, 2)],
    {
      type: 'application/json',
    },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hgrp-look-${label.toLowerCase().replace(/\s+/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Pick a look file and apply it; it is also saved under the file's label. */
export function importLook(onApplied?: () => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { label?: string; look?: HGRPLook };
      if (!parsed.look) throw new Error('no "look" object in the file');
      applyLook(parsed.look);
      saveLookPreset(parsed.label ?? file.name.replace(/\.json$/i, ''));
      onApplied?.();
    } catch (error) {
      console.error('[lookPresets] failed to import a look:', error);
    }
  };
  input.click();
}

/** Snapshot the defaults as the Studio look; the stage calls this once before any knob moves. */
export function captureStudioLook(): void {
  studio = currentLook();
}
