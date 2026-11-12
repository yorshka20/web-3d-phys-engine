import { SkeletonComponent, World } from '@ecs';
import { GLTFModel } from '@renderer/assets/GltfModel';
import { assetRegistry } from '@renderer/webGPU/core/AssetRegistry';
import {
  ensureHGRPClip,
  HGRPClipSource,
  hgrpStage,
  HGRPStageCharacter,
  onHGRPStageChange,
  setHGRPCharacterVisible,
} from '../../stages/hgrp/characters';
import {
  focusedHGRPCharacter,
  focusHGRPCharacter,
  onHGRPFocusChange,
} from '../../stages/hgrp/focus';
import {
  applyLookPreset,
  HGRPLookPreset,
  lookPresets,
  onLookPresetsChange,
} from '../../stages/hgrp/lookPresets';
import { CAMERA_VIEW_PRESETS, cameraViews } from '../camera/views';
import { isUIHidden, onUIHiddenChange, setUIHidden } from '../visibility';

// The showcase's view of the stage. The stage modules (stages/hgrp/*) hold the truth — the
// roster, who is loaded, what plays — and this mirror is what the Svelte components render:
// refreshed from the stage's own change events, never edited directly. Every action here
// is a call into the stage, so the tweakpane Character tab and the showcase move the same
// state and agree.

export interface ShowcaseCharacter {
  assetId: string;
  label: string;
  onStage: boolean;
  loading: boolean;
  focused: boolean;
}

export interface ShowcaseClip {
  name: string;
  duration?: number;
  own: boolean;
  drivesBody: boolean;
}

export interface ShowcasePlayback {
  clip: string;
  playing: boolean;
  loop: boolean;
  speed: number;
  time: number;
  duration: number;
}

const loadingIds = new Set<string>();

export const showcase = $state({
  characters: [] as ShowcaseCharacter[],
  // Whose transport is shown: the focused character, or the first on stage
  subject: undefined as string | undefined,
  subjectLabel: '',
  clips: [] as ShowcaseClip[],
  playback: { clip: '', playing: false, loop: true, speed: 1, time: 0, duration: 0 },
  looks: [] as HGRPLookPreset[],
  views: CAMERA_VIEW_PRESETS,
  hidden: false,
});

function subjectCharacter(): HGRPStageCharacter | undefined {
  return (
    focusedHGRPCharacter() ??
    hgrpStage.characters.find((character) => character.entity && character.visible)
  );
}

function skeletonOf(character: HGRPStageCharacter | undefined): SkeletonComponent | undefined {
  return character?.entity?.getComponent<SkeletonComponent>(SkeletonComponent.componentName);
}

function attachedClipName(character: HGRPStageCharacter, index: number): string {
  const model = assetRegistry.getAssetDescriptor<'gltf'>(character.assetId)?.rawData as
    | GLTFModel
    | undefined;
  return model?.animations?.[index]?.name ?? '';
}

function refreshRoster(): void {
  const focused = focusedHGRPCharacter();
  showcase.characters = hgrpStage.characters.map((character) => ({
    assetId: character.assetId,
    label: character.label,
    onStage: Boolean(character.entity && character.visible),
    loading: loadingIds.has(character.assetId),
    focused: character === focused,
  }));
  const subject = subjectCharacter();
  showcase.subject = subject?.assetId;
  showcase.subjectLabel = subject?.label ?? '';
  showcase.clips = subject
    ? subject.source.clips.map((clip: HGRPClipSource) => ({
        name: clip.name,
        duration: clip.duration,
        own: clip.own,
        drivesBody: clip.drivesBody,
      }))
    : [];
  refreshPlayback();
}

/** Pull the subject's playback state; cheap enough to run per frame while a clip plays. */
export function refreshPlayback(): void {
  const subject = subjectCharacter();
  const skeleton = skeletonOf(subject);
  if (!subject || !skeleton) {
    showcase.playback = { clip: '', playing: false, loop: true, speed: 1, time: 0, duration: 0 };
    return;
  }
  const clip = attachedClipName(subject, skeleton.clipIndex);
  const duration = showcase.clips.find((entry) => entry.name === clip)?.duration ?? 0;
  const playback = showcase.playback;
  if (playback.clip !== clip) playback.clip = clip;
  if (playback.playing !== skeleton.playing) playback.playing = skeleton.playing;
  if (playback.loop !== skeleton.loop) playback.loop = skeleton.loop;
  if (playback.speed !== skeleton.speed) playback.speed = skeleton.speed;
  if (playback.time !== skeleton.time) playback.time = skeleton.time;
  if (playback.duration !== duration) playback.duration = duration;
}

function refreshLooks(): void {
  showcase.looks = lookPresets();
}

let world: World | undefined;
let unsubscribe: (() => void)[] = [];

export function connectShowcase(target: World): () => void {
  world = target;
  refreshRoster();
  refreshLooks();
  showcase.hidden = isUIHidden();
  unsubscribe = [
    onHGRPStageChange(refreshRoster),
    onHGRPFocusChange(refreshRoster),
    onLookPresetsChange(refreshLooks),
    onUIHiddenChange((hidden) => {
      showcase.hidden = hidden;
    }),
  ];
  return () => {
    for (const off of unsubscribe) off();
    unsubscribe = [];
    world = undefined;
  };
}

// ---- actions: each one is a call into the stage ----

/** Put a character on stage (loading it the first time) and focus it. */
export async function showCharacter(assetId: string): Promise<void> {
  const character = hgrpStage.characters.find((entry) => entry.assetId === assetId);
  if (!character || !world) return;
  if (!(character.entity && character.visible)) {
    loadingIds.add(assetId);
    refreshRoster();
    try {
      await setHGRPCharacterVisible(world, character, true);
    } catch (error) {
      console.error(`[showcase] ${character.label} failed to load:`, error);
      return;
    } finally {
      loadingIds.delete(assetId);
    }
  }
  focusHGRPCharacter(assetId);
}

/** Take a character off stage; its assets stay resident (unloading is a separate concern). */
export async function hideCharacter(assetId: string): Promise<void> {
  const character = hgrpStage.characters.find((entry) => entry.assetId === assetId);
  if (!character || !world) return;
  if (focusedHGRPCharacter() === character) focusHGRPCharacter(undefined, false);
  await setHGRPCharacterVisible(world, character, false);
}

export async function selectClip(name: string): Promise<void> {
  const subject = subjectCharacter();
  const skeleton = skeletonOf(subject);
  if (!subject || !skeleton) return;
  try {
    const index = await ensureHGRPClip(subject, name);
    skeleton.clipIndex = index;
    skeleton.time = 0;
    skeleton.playing = true;
    refreshPlayback();
  } catch (error) {
    console.error(error);
  }
}

export function setPlaying(playing: boolean): void {
  const skeleton = skeletonOf(subjectCharacter());
  if (skeleton) skeleton.playing = playing;
  refreshPlayback();
}

export function setLoop(loop: boolean): void {
  const skeleton = skeletonOf(subjectCharacter());
  if (skeleton) skeleton.loop = loop;
  refreshPlayback();
}

export function setSpeed(speed: number): void {
  const skeleton = skeletonOf(subjectCharacter());
  if (skeleton) skeleton.speed = speed;
  refreshPlayback();
}

export function seek(time: number): void {
  const skeleton = skeletonOf(subjectCharacter());
  if (skeleton) skeleton.time = time;
  refreshPlayback();
}

export function applyLook(id: string): void {
  applyLookPreset(id);
}

export function applyView(id: string): void {
  cameraViews().preset(id);
}

export function frameSubject(): void {
  cameraViews().focus();
}

export function faceSubject(): void {
  cameraViews().face();
}

export function hideUI(): void {
  setUIHidden(true);
}

/**
 * Save the presented frame as a PNG. The WebGPU canvas keeps its last presented image
 * readable, so no render hook is needed; the file is named after what is on screen.
 */
export function screenshot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-scene-surface]');
  if (!canvas) {
    console.warn('[showcase] no scene canvas to capture');
    return;
  }
  const subject = showcase.subjectLabel || 'stage';
  const clip = showcase.playback.clip.replace(/[\\/]/g, '_') || 'bind-pose';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  canvas.toBlob((blob) => {
    if (!blob) {
      console.warn('[showcase] the canvas gave no image');
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hgrp-${subject}-${clip}-${stamp}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
