import {
  Entity,
  Mesh3DComponent,
  SkeletonComponent,
  Transform3DComponent,
  WebGPU3DRenderComponent,
  World,
} from '@ecs';
import { AssetLoader, assetRegistry } from '@renderer';
import { GLTFModel } from '@renderer/assets/GltfModel';
import { attachHumanoidRig } from '@renderer/assets/humanoid/binding';
import { HGRPCharacterFlags, HGRPPreset } from '@renderer/material/hgrp';
import { quat, vec3 } from 'gl-matrix';

// The HGRP stage roster: which characters exist, which of them are on stage, and where they
// stand. A character's assets are only fetched when it is first switched on, because one
// character costs 200-350 MB of decoded texture data that is held for the session — loading
// the whole roster up front exhausts the tab long before the picture is interesting.
//
// Layout runs in LAYOUT space — metres at the assets' own scale, ground at y = 0 — and turns
// each character's row slot plus the user's adjustments into the entity's transform:
//
//   world scale     = globalScale x character scale
//   anchor          = the model-space point set on the slot's ground point (bounds centre x/z,
//                     lowest y — the feet), so the model stands on the ground whatever its
//                     rip offset (Pelica's bind pose sits at x/z ≈ [-2.07, 4.97], Laevatian's is
//                     origin-centred)
//   slot ground pt  = globalScale x (slot + offset), lifted to the stage ground
//   position        = slot ground point - R(rotation) * (world scale * anchor)
//
// Subtracting the ROTATED, SCALED anchor keeps the feet on the slot point when the character
// is rotated or resized: the transform rotates about the model origin, which is not where
// the feet are. Global scale scales the layout too (slots spread apart with the characters)
// so the group keeps its arrangement; the ground plane (main.ts) does not move.
//
// The shaders read the draw's world scale off the model matrix (core/hgrp_transform.wgsl), so
// no shading constant needs retuning when these change.

// One clip file of the pool (assets/hgrp/<folder>/clips/<clip>.glb) as one character sees it:
// `own` for the clips in its own folder, listed first under their bare name; the body-type
// sets (`_common/<bodyType>/<clip>`) and every other character's clips (`<folder>/<clip>`)
// follow, so a rig can be driven by any clip on the stage (matched by node path — the shared
// Bip001 chain moves, the rest holds its pose). The pool is a catalogue: a clip's file is
// fetched and joined onto the model the first time it is asked for (ensureHGRPClip), never
// up front — with a thousand clips on the stage, eager loading would cost each character
// gigabytes.
export interface HGRPClipSource {
  name: string;
  url: string;
  own: boolean;
  // From the folder's clips/index.json (scripts/hgrp/convert.mjs): seconds, and whether the
  // clip keys the body's root joint. An overlay that only moves cloth or hair is still in the
  // pool, but never the clip a character starts with.
  duration?: number;
  drivesBody: boolean;
}

interface HGRPCharacterSource {
  modelUrl: string;
  presetUrl: string;
  textureUrls: Record<string, string>;
  clips: readonly HGRPClipSource[];
  // The character's Unity Avatar and the converter's binding of it to the glb, for the
  // characters that have humanoid clips (scripts/hgrp/convert.mjs --humanoid-src)
  avatarUrl?: string;
  avatarBindingUrl?: string;
}

export interface HGRPStageCharacter {
  assetId: string;
  label: string;
  source: HGRPCharacterSource;
  // Undefined until the character is first switched on (assets fetched, entity created)
  entity: Entity | undefined;
  visible: boolean;
  // Model-space point placed on the slot's ground point; known once the model is loaded
  anchor: readonly [number, number, number];
  // Footprint along X, what the row layout spaces the characters by
  width: number;
  // Layout-space ground point of the slot (y is always 0), assigned by the row layout
  slot: readonly [number, number, number];
  // Calibration-panel adjustments, in layout metres / degrees / a multiplier on globalScale
  offset: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  // Whether the weapon meshes rigged into the character document are drawn, as far as the user
  // is concerned: a clip's WeaponHide parameter hides them on top of this (weaponHide.ts), the
  // way the game does per clip; the photo mode's own rule has no counterpart here.
  weaponVisible: boolean;
  // Mesh instances of the weapon (`S_wpn_*`), as WebGPU3DRenderComponent addresses them; known
  // once the model is loaded
  weaponInstances: readonly number[];
}

export const hgrpStage = {
  // Uniform scale of the whole layout; 1 = the assets' metre scale. Larger values make the
  // characters fill the camera's orbit range, which is what the detail-inspection sessions
  // need. `?scale=` seeds it, the Stage tab edits it live.
  globalScale: 4,
  // Ground plane height (main.ts createPlane); the characters' feet sit here.
  groundY: -1,
  characters: [] as HGRPStageCharacter[],
};

// Clear space between two models' bind-pose bounding boxes, in layout metres.
const CHARACTER_GAP = 0.5;

// The pair the HGRP shading was calibrated against — on stage from the start so the default
// picture is the reference one; the rest of the roster is switched on from the Stage tab.
const DEFAULT_CHARACTER_FOLDERS = ['pelica', 'laevat', 'ardelia'];

// Every asset under assets/hgrp is a roster entry, so a newly converted character
// (scripts/hgrp/convert.mjs) appears in the Stage tab without a code change. Only URLs are
// pulled in here — the preset JSON is fetched at load time rather than inlined, so an
// unswitched character costs nothing but its row in the list. Vite parses import.meta.glob
// statically, so the pattern and options must stay literals at the call site.
const MODEL_URLS = import.meta.glob('../../../assets/hgrp/*/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const PRESET_URLS = import.meta.glob('../../../assets/hgrp/*/preset.json', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const TEXTURE_URLS = import.meta.glob('../../../assets/hgrp/*/textures/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// A character with humanoid clips carries its Avatar (the export's avatar.json, verbatim) and
// the converter's binding of it to the glb; both are fetched with the model, never inlined.
const AVATAR_URLS = import.meta.glob('../../../assets/hgrp/*/avatar.json', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const AVATAR_BINDING_URLS = import.meta.glob('../../../assets/hgrp/*/avatar.binding.json', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// Clips live beside the model they were baked against, one glTF file per clip
// (scripts/hgrp/convert.mjs, from the export's clip FBX files), and are joined onto a model
// by node path when first selected — the model glb is never rewritten for a clip. Every clip
// on the stage is one pool: a character lists its own first, then the shared body-type sets,
// then everyone else's.
const CLIP_URLS = {
  ...(import.meta.glob('../../../assets/hgrp/*/clips/*.glb', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>),
  ...(import.meta.glob('../../../assets/hgrp/_common/*/clips/*.glb', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>),
};

// The converter's per-folder clip index: what the engine knows about a clip before fetching it
interface HGRPClipIndex {
  clips: { name: string; duration: number; drivesBody: boolean }[];
}

const CLIP_INDEXES = {
  ...(import.meta.glob('../../../assets/hgrp/*/clips/index.json', {
    eager: true,
    import: 'default',
  }) as Record<string, HGRPClipIndex>),
  ...(import.meta.glob('../../../assets/hgrp/_common/*/clips/index.json', {
    eager: true,
    import: 'default',
  }) as Record<string, HGRPClipIndex>),
};

function folderOf(path: string): string {
  return path.replace(/^.*\/assets\/hgrp\//, '').split('/')[0];
}

// The folder a clip belongs to: a character's (`pelica`) or a body-type set's (`_common/boy`)
function clipFolderOf(path: string): string {
  return path.replace(/^.*\/assets\/hgrp\//, '').replace(/\/clips\/.*$/, '');
}

// A character folder holds `<folder>.glb` and, for the few characters that carry a prop
// rigged on its own armature, `widget.glb`. Both join the same preset and texture folder,
// and the widget stands on its own slot because nothing attaches it to a hand joint yet.
function readRoster(): HGRPStageCharacter[] {
  const textureUrlsByFolder = new Map<string, Record<string, string>>();
  for (const [path, url] of Object.entries(TEXTURE_URLS)) {
    const folder = folderOf(path);
    const urls = textureUrlsByFolder.get(folder) ?? {};
    urls[path.split('/').pop()!] = url;
    textureUrlsByFolder.set(folder, urls);
  }

  const clipInfo = new Map<string, HGRPClipIndex['clips'][number]>();
  for (const [path, index] of Object.entries(CLIP_INDEXES)) {
    const folder = clipFolderOf(path);
    for (const clip of index.clips) clipInfo.set(`${folder}/${clip.name}`, clip);
  }
  const clipPool = Object.entries(CLIP_URLS)
    .map(([path, url]) => {
      const folder = clipFolderOf(path);
      const clip = path
        .split('/')
        .pop()!
        .replace(/\.glb$/, '');
      const info = clipInfo.get(`${folder}/${clip}`);
      return { folder, clip, url, duration: info?.duration, drivesBody: info?.drivesBody ?? true };
    })
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.clip.localeCompare(b.clip));
  const shared = (entry: { folder: string }) => (entry.folder.startsWith('_') ? 0 : 1);
  const clipsFor = (folder: string): HGRPClipSource[] => [
    ...clipPool
      .filter((entry) => entry.folder === folder)
      .map((entry) => ({ ...entry, name: entry.clip, own: true })),
    ...clipPool
      .filter((entry) => entry.folder !== folder)
      .sort((a, b) => shared(a) - shared(b))
      .map((entry) => ({ ...entry, name: `${entry.folder}/${entry.clip}`, own: false })),
  ];

  const roster: { folder: string; character: HGRPStageCharacter }[] = [];
  for (const [path, modelUrl] of Object.entries(MODEL_URLS)) {
    const folder = folderOf(path);
    const presetUrl = PRESET_URLS[`../../../assets/hgrp/${folder}/preset.json`];
    if (!presetUrl) {
      console.warn(`[hgrp] ${folder} has no preset.json, skipped`);
      continue;
    }
    const isWidget = path.endsWith('/widget.glb');
    roster.push({
      folder,
      character: {
        assetId: `hgrp_${folder}${isWidget ? '_widget' : ''}`,
        label: isWidget ? `${folder}-widget` : folder,
        source: {
          modelUrl,
          presetUrl,
          textureUrls: textureUrlsByFolder.get(folder) ?? {},
          clips: clipsFor(folder),
          avatarUrl: AVATAR_URLS[`../../../assets/hgrp/${folder}/avatar.json`],
          avatarBindingUrl:
            AVATAR_BINDING_URLS[`../../../assets/hgrp/${folder}/avatar.binding.json`],
        },
        entity: undefined,
        visible: DEFAULT_CHARACTER_FOLDERS.includes(folder),
        anchor: [0, 0, 0],
        width: 0,
        slot: [0, 0, 0],
        offset: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1,
        weaponVisible: true,
        weaponInstances: [],
      },
    });
  }
  // The default characters lead, in the order they are declared, so the reference picture
  // keeps the arrangement the calibration screenshots were taken in; the rest follow in
  // glob order (alphabetical, a character ahead of its own widget).
  const rank = (folder: string) => {
    const index = DEFAULT_CHARACTER_FOLDERS.indexOf(folder);
    return index < 0 ? DEFAULT_CHARACTER_FOLDERS.length : index;
  };
  return roster.sort((a, b) => rank(a.folder) - rank(b.folder)).map((entry) => entry.character);
}

export function resetHGRPStage(): void {
  hgrpStage.globalScale = hgrpScaleFromUrl();
  hgrpStage.characters = readRoster();
}

export function hgrpScaleFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('scale');
  const parsed = raw === null ? NaN : Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : hgrpStage.globalScale;
}

// Optional material layers are per character, so the switch travels with the load call.
// `?maxpotential=1` turns on every character's CharacterNPR_VFX layer for look comparison,
// the same way `?clip=` picks an animation.
function characterFlags(): HGRPCharacterFlags {
  return {
    maxPotential: new URLSearchParams(window.location.search).get('maxpotential') === '1',
  };
}

// The panels rebuild their per-character sections from this, since a character can join the
// stage at any time.
const listeners = new Set<() => void>();

export function onHGRPStageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

interface ModelBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Union of every primitive's bind-pose bounds.
 *
 * Placement must be derived rather than authored per character: the rip's bind pose sits
 * wherever the source scene put it — Pelica's is offset (bounds centre x/z ≈ [-2.07, 4.97],
 * feet at y=0.69) while Laevatian's is already origin-centred with feet at y=0. Hardcoding
 * one character's offset silently misplaces every other.
 */
function modelBounds(model: GLTFModel): ModelBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of model.meshes) {
    for (const primitive of mesh.primitives) {
      const { min: pMin, max: pMax } = primitive.geometry.bounds;
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], pMin[axis]);
        max[axis] = Math.max(max[axis], pMax[axis]);
      }
    }
  }
  return { min, max };
}

function createCharacterEntity(world: World, character: HGRPStageCharacter): Entity {
  const entity = world.createEntity('object');
  entity.setLabel(character.label);

  entity.addComponent(
    world.createComponent(Mesh3DComponent, {
      descriptor: { type: 'gltf', primitiveType: 'triangle-list', assetId: character.assetId },
    }),
  );

  // Placed by the row layout once the entity carries its transform; the anchor is the
  // model's feet, the slot its ground point in the row.
  entity.addComponent(
    world.createComponent(Transform3DComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }),
  );

  // The rig is posed every render tick by SkeletalAnimationSystem. The one clip attached at
  // load (loadHGRPCharacter) is animation 0; a character without clips of its own starts
  // paused in its bind pose — the pool still offers it every other character's clip, but
  // only when the user asks for one.
  entity.addComponent(
    world.createComponent(SkeletonComponent, {
      clipIndex: 0,
      playing: character.source.clips.some((clip) => clip.own && clip.drivesBody),
    }),
  );

  // No material: an HGRP primitive is drawn from the material joined onto it at load time.
  entity.addComponent(
    world.createComponent(WebGPU3DRenderComponent, { visible: character.visible }),
  );

  world.addEntity(entity);
  applyHGRPWeaponVisibility(character, entity);
  return entity;
}

// The export names a weapon's meshes `S_wpn_*` (a pen, a staff, a bow), rigged into the
// character document on the hand sockets or the IK weapon targets; every other mesh is the
// character. Instance indices, as WebGPU3DRenderComponent addresses them.
function weaponInstancesOf(model: GLTFModel): number[] {
  return model.instances.flatMap((instance, index) =>
    /^S_wpn_/i.test(model.meshes[instance.meshIndex].name) ? [index] : [],
  );
}

/**
 * Draw or hide the character's weapon instances: shown only when the user's switch is on and
 * the playing clip does not hide it (`clipHides`, the WeaponHide parameter — weaponHide.ts).
 */
export function applyHGRPWeaponVisibility(
  character: HGRPStageCharacter,
  entity: Entity,
  clipHides = false,
): void {
  const render = entity.getComponent<WebGPU3DRenderComponent>(
    WebGPU3DRenderComponent.componentName,
  );
  if (!render) return;
  const visible = character.weaponVisible && !clipHides;
  for (const index of character.weaponInstances) {
    render.setInstanceVisible(index, visible);
  }
}

export function setHGRPWeaponVisible(character: HGRPStageCharacter, visible: boolean): void {
  character.weaponVisible = visible;
  if (character.entity) applyHGRPWeaponVisibility(character, character.entity);
}

// Concurrent switch-ons of the same character (a double click, or the stage's own default
// load racing the panel) must share one load, or the second run registers the asset twice.
const loading = new Map<string, Promise<void>>();

export function loadHGRPCharacter(world: World, character: HGRPStageCharacter): Promise<void> {
  const inFlight = loading.get(character.assetId);
  if (inFlight) {
    return inFlight;
  }
  const load = (async () => {
    const preset = (await (await fetch(character.source.presetUrl)).json()) as HGRPPreset;
    await AssetLoader.loadHGRPCharacter({
      url: character.source.modelUrl,
      assetId: character.assetId,
      preset,
      textureUrls: character.source.textureUrls,
      flags: characterFlags(),
    });

    const model = assetRegistry.getAssetDescriptor<'gltf'>(character.assetId)?.rawData as
      | GLTFModel
      | undefined;
    if (!model) {
      throw new Error(`[hgrp] ${character.assetId} loaded but is not in the asset registry`);
    }
    // One own clip comes with the model so the character moves as soon as it is on stage: the
    // first (alphabetical) own clip that moves the body — an overlay fragment that only keys
    // cloth or hair would leave the body in bind pose with the cloth flung a metre away.
    // `?clip=<n>` picks the n-th own clip instead, for look comparison against in-game footage.
    const own = character.source.clips.filter((clip) => clip.own);
    const requested = Number.parseInt(
      new URLSearchParams(window.location.search).get('clip') ?? '',
      10,
    );
    const first = Number.isNaN(requested)
      ? own.find((clip) => clip.drivesBody)
      : (own[requested] ?? own.find((clip) => clip.drivesBody));
    // The Avatar binds before any clip is attached: a humanoid clip's body is solved against
    // it at play time, on this character or any other with an Avatar (Unity's retargeting).
    const { avatarUrl, avatarBindingUrl } = character.source;
    if (avatarUrl && avatarBindingUrl) {
      const [avatar, binding] = await Promise.all([
        fetch(avatarUrl).then((response) => response.json()),
        fetch(avatarBindingUrl).then((response) => response.json()),
      ]);
      attachHumanoidRig(model, avatar, binding);
    } else if (avatarUrl || avatarBindingUrl) {
      console.warn(
        `[hgrp] ${character.label}: avatar.json and avatar.binding.json must both be present; humanoid clips will not move the body`,
      );
    }
    if (first) {
      await AssetLoader.loadGLTFClips(character.assetId, [first]);
    }
    const { min, max } = modelBounds(model);
    character.anchor = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
    character.width = max[0] - min[0];
    character.weaponInstances = weaponInstancesOf(model);
    character.entity = createCharacterEntity(world, character);

    console.log(
      `[hgrp] ${character.label}: ${own.length} own clips, ${character.source.clips.length} in the pool` +
        (first ? `, playing ${first.name}` : ', bind pose') +
        (model.humanoid ? `, Avatar ${model.humanoid.rig.name}` : ''),
    );
  })();
  loading.set(character.assetId, load);
  return load;
}

// Attaching a clip is a fetch plus a join, so a clip is attached once per character however
// often the panel asks for it, and two asks in flight share the same load.
const attaching = new Map<string, Promise<number>>();

/**
 * Index of `clipName` (an HGRPClipSource name) in the character's attached animations,
 * fetching and joining the clip file first when it is not attached yet.
 */
export function ensureHGRPClip(character: HGRPStageCharacter, clipName: string): Promise<number> {
  const model = assetRegistry.getAssetDescriptor<'gltf'>(character.assetId)?.rawData as
    | GLTFModel
    | undefined;
  if (!model) {
    return Promise.reject(new Error(`[hgrp] ${character.assetId} is not loaded`));
  }
  const attached = (model.animations ?? []).findIndex((clip) => clip.name === clipName);
  if (attached >= 0) {
    return Promise.resolve(attached);
  }
  const key = `${character.assetId}\n${clipName}`;
  const inFlight = attaching.get(key);
  if (inFlight) {
    return inFlight;
  }
  const source = character.source.clips.find((clip) => clip.name === clipName);
  if (!source) {
    return Promise.reject(new Error(`[hgrp] ${clipName} is not in the clip pool`));
  }
  const load = AssetLoader.loadGLTFClips(character.assetId, [source])
    .then(() => {
      const index = (model.animations ?? []).findIndex((clip) => clip.name === clipName);
      if (index < 0) {
        throw new Error(`[hgrp] clip ${clipName} attached no animation`);
      }
      return index;
    })
    .finally(() => {
      attaching.delete(key);
    });
  attaching.set(key, load);
  return load;
}

export async function setHGRPCharacterVisible(
  world: World,
  character: HGRPStageCharacter,
  visible: boolean,
): Promise<void> {
  character.visible = visible;
  if (visible && !character.entity) {
    await loadHGRPCharacter(world, character);
  }
  character.entity
    ?.getComponent<WebGPU3DRenderComponent>(WebGPU3DRenderComponent.componentName)
    ?.setVisible(visible);
  relayoutHGRPStage();
  for (const listener of listeners) {
    listener();
  }
}

// The row re-packs around whoever is on stage, so switching a character off closes its gap
// instead of leaving a hole in the arrangement.
export function relayoutHGRPStage(): void {
  const onStage = hgrpStage.characters.filter((character) => character.entity && character.visible);
  const totalWidth =
    onStage.reduce((sum, character) => sum + character.width, 0) +
    CHARACTER_GAP * Math.max(onStage.length - 1, 0);
  let cursorX = -totalWidth / 2;
  for (const character of onStage) {
    character.slot = [cursorX + character.width / 2, 0, 0];
    cursorX += character.width + CHARACTER_GAP;
  }
  applyAllHGRPPlacements();
}

const scratchAnchor = vec3.create();
const scratchQuat = quat.create();

export function applyHGRPPlacement(character: HGRPStageCharacter): void {
  const transform = character.entity?.getComponent<Transform3DComponent>(
    Transform3DComponent.componentName,
  );
  if (!transform) {
    return;
  }
  const { globalScale, groundY } = hgrpStage;
  const worldScale = globalScale * character.scale;
  const { offset, rotation, slot, anchor } = character;

  // Same quaternion construction as Transform3DComponent.getWorldMatrix (degrees in).
  quat.fromEuler(scratchQuat, rotation.x, rotation.y, rotation.z);
  vec3.set(scratchAnchor, anchor[0] * worldScale, anchor[1] * worldScale, anchor[2] * worldScale);
  vec3.transformQuat(scratchAnchor, scratchAnchor, scratchQuat);

  transform.setPosition([
    globalScale * (slot[0] + offset.x) - scratchAnchor[0],
    groundY + globalScale * offset.y - scratchAnchor[1],
    globalScale * (slot[2] + offset.z) - scratchAnchor[2],
  ]);
  transform.setRotation([
    (rotation.x * Math.PI) / 180,
    (rotation.y * Math.PI) / 180,
    (rotation.z * Math.PI) / 180,
  ]);
  transform.setScale([worldScale, worldScale, worldScale]);
}

export function applyAllHGRPPlacements(): void {
  for (const character of hgrpStage.characters) {
    applyHGRPPlacement(character);
  }
}

export function resetHGRPPlacement(character: HGRPStageCharacter): void {
  character.offset.x = 0;
  character.offset.y = 0;
  character.offset.z = 0;
  character.rotation.x = 0;
  character.rotation.y = 0;
  character.rotation.z = 0;
  character.scale = 1;
  applyHGRPPlacement(character);
}
