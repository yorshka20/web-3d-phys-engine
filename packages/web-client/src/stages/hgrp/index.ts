import {
  Mesh3DComponent,
  SkeletonComponent,
  Transform3DComponent,
  WebGPU3DRenderComponent,
} from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader, assetRegistry } from '@renderer';
import { GLTFModel } from '@renderer/assets/GltfModel';
import { HGRPCharacterFlags, HGRPPreset } from '@renderer/material/hgrp';
import { sceneSettings } from '@renderer/webGPU/renderer/sceneSettings';
import { rgba } from '@ecs/utils/color';

import { registerDebugTab } from '../../ui/debugTabs';
import { createHGRPShadingTab } from '../../ui/hgrpShadingPanel';

import laevatianModel from '../../../assets/hgrp/laevatian/laevatian.glb?url';
import laevatianPreset from '../../../assets/hgrp/laevatian/preset.json';
import laevatianWidgetModel from '../../../assets/hgrp/laevatian/widget.glb?url';
import pelicaModel from '../../../assets/hgrp/pelica/pelica.glb?url';
import pelicaPreset from '../../../assets/hgrp/pelica/preset.json';

// Every texture in the character folder, keyed by filename; the loader registers the ones
// the preset references. eager+url keeps them as served URLs, not inlined data. Vite parses
// import.meta.glob statically, so its options must stay an inline object literal at each
// call site — a shared constant fails the build.
function textureUrlsFrom(glob: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(glob).map(([path, url]) => [path.split('/').pop()!, url as string]),
  );
}

export const HGRP_PELICA_ASSET_ID = 'hgrp_pelica';
export const HGRP_LAEVATIAN_ASSET_ID = 'hgrp_laevatian';
export const HGRP_LAEVATIAN_WIDGET_ASSET_ID = 'hgrp_laevatian_widget';

interface HGRPModelSource {
  assetId: string;
  label: string;
  modelUrl: string;
  preset: HGRPPreset;
  textureUrls: Record<string, string>;
  flags?: HGRPCharacterFlags;
}

// Optional material layers are per character, so the switch travels with the load call.
// `?maxpotential=1` turns on every character's CharacterNPR_VFX layer for look comparison,
// the same way `?clip=` picks an animation.
function characterFlags(): HGRPCharacterFlags {
  return {
    maxPotential: new URLSearchParams(window.location.search).get('maxpotential') === '1',
  };
}

const MODELS: HGRPModelSource[] = [
  {
    assetId: HGRP_PELICA_ASSET_ID,
    label: 'pelica',
    modelUrl: pelicaModel,
    preset: pelicaPreset as HGRPPreset,
    textureUrls: textureUrlsFrom(
      import.meta.glob('../../../assets/hgrp/pelica/textures/*.png', {
        eager: true,
        query: '?url',
        import: 'default',
      }),
    ),
  },
  {
    assetId: HGRP_LAEVATIAN_ASSET_ID,
    label: 'laevatian',
    modelUrl: laevatianModel,
    preset: laevatianPreset as HGRPPreset,
    textureUrls: textureUrlsFrom(
      import.meta.glob('../../../assets/hgrp/laevatian/textures/*.png', {
        eager: true,
        query: '?url',
        import: 'default',
      }),
    ),
  },
  // The prop the character carries, rigged on its own armature rather than the character's
  // skeleton, so it loads as a separate model and stands on its own. Attaching it to a hand
  // joint is a future feature. It shares Laevatian's preset and texture folder: its
  // materials come from the same rip and the converter writes both into one preset.
  {
    assetId: HGRP_LAEVATIAN_WIDGET_ASSET_ID,
    label: 'laevatian-widget',
    modelUrl: laevatianWidgetModel,
    preset: laevatianPreset as HGRPPreset,
    textureUrls: textureUrlsFrom(
      import.meta.glob('../../../assets/hgrp/laevatian/textures/*.png', {
        eager: true,
        query: '?url',
        import: 'default',
      }),
    ),
  },
];

// Ground plane sits here (main.ts cretePlane); models stand on it.
const GROUND_Y = -1;
// Clear space between two models' bind-pose bounding boxes.
const CHARACTER_GAP = 0.5;

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

// Stage B: the converted HGRP characters render through the HGRP material family — materials
// joined from preset.json by glb material name. The scene runs at the assets' own scale
// (metres, character ≈ 1.7 tall); the world-unit shading constants (rim depth gap, outline
// z-offset, eye depth bias) are calibrated against that.
export async function createHGRPStage(world: World) {
  // Bright studio backdrop (linear light, pre-tonemap) — the in-game character showcase
  // sits on a light grey ground, and look comparison against screenshots needs it
  sceneSettings.clearColor = [0.7, 0.7, 0.73];

  for (const character of MODELS) {
    await AssetLoader.loadHGRPCharacter({
      url: character.modelUrl,
      assetId: character.assetId,
      preset: character.preset,
      textureUrls: character.textureUrls,
      flags: character.flags ?? characterFlags(),
    });
  }

  // The calibration UI belongs to this stage, not to main: every loaded model gets its own
  // section, so two characters are tuned and saved independently.
  registerDebugTab(createHGRPShadingTab(MODELS.map((model) => model.assetId)));

  const placements = MODELS.map((character) => {
    const model = assetRegistry.getAssetDescriptor<'gltf'>(character.assetId)?.rawData as
      | GLTFModel
      | undefined;
    return { character, model, bounds: model ? modelBounds(model) : undefined };
  }).filter((entry) => entry.bounds !== undefined);

  // Lay the models out along X, the group centred on the origin.
  const widths = placements.map(({ bounds }) => bounds!.max[0] - bounds!.min[0]);
  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) + CHARACTER_GAP * (widths.length - 1);
  let cursorX = -totalWidth / 2;

  for (const [index, { character, model, bounds }] of placements.entries()) {
    const { min, max } = bounds!;
    const slotCentreX = cursorX + widths[index] / 2;
    cursorX += widths[index] + CHARACTER_GAP;

    const entity = world.createEntity('object');
    entity.setLabel(character.label);

    entity.addComponent(
      world.createComponent(Mesh3DComponent, {
        descriptor: { type: 'gltf', primitiveType: 'triangle-list', assetId: character.assetId },
      }),
    );

    entity.addComponent(
      world.createComponent(Transform3DComponent, {
        position: [slotCentreX - (min[0] + max[0]) / 2, GROUND_Y - min[1], -(min[2] + max[2]) / 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }),
    );

    // The rig is posed every render tick by SkeletalAnimationSystem. Pelica's clip 0 is the
    // summon entrance and clip 1 its standing idle loop (scripts/hgrp/anim-convert.mjs);
    // `?clip=` picks between them for look comparison against in-game footage of the same
    // animation. A model with no converted clips composes its bind pose instead.
    const clips = model?.animations ?? [];
    if (clips.length > 0) {
      console.log(
        `[hgrp] ${character.label} clips: ${clips
          .map((clip, i) => `${i}:${clip.name} (${clip.duration.toFixed(2)}s)`)
          .join(', ')}`,
      );
    }
    const requestedClip = Number.parseInt(
      new URLSearchParams(window.location.search).get('clip') ?? '0',
      10,
    );
    entity.addComponent(
      world.createComponent(SkeletonComponent, {
        clipIndex: Number.isNaN(requestedClip) ? 0 : requestedClip,
      }),
    );

    // Component material is only the fallback for primitives without a document material;
    // every HGRP primitive carries a material joined at load time.
    entity.addComponent(
      world.createComponent(WebGPU3DRenderComponent, {
        material: {
          albedo: rgba('#ffffff'),
          metallic: 0,
          roughness: 0.5,
          emissive: rgba('#000000'),
          emissiveIntensity: 0,
          customShaderId: 'gltf_material_shader',
          materialType: 'gltf' as const,
        },
      }),
    );

    world.addEntity(entity);
  }
}
