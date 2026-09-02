import { Entity, Mesh3DComponent, SkeletonComponent } from '@ecs';
import { GLTFAnimation, GLTFModel } from '@renderer/assets/GltfModel';
import { assetRegistry } from '@renderer/webGPU/core/AssetRegistry';
import { FolderApi, Pane } from 'tweakpane';
import {
  applyAllHGRPPlacements,
  applyHGRPPlacement,
  HGRPCharacterPlacement,
  hgrpStagePlacement,
  resetHGRPPlacement,
} from '../stages/hgrp/placement';
import { DebugTab } from './debugTabs';

// The Stage tab: the layout's global scale and, per character, its placement (position offset,
// rotation, own scale — final scale = global x own) and its animation playback. Placement
// widgets bind to the placement records and re-apply the transform on change
// (stages/hgrp/placement.ts); playback widgets bind straight to the entity's SkeletonComponent,
// which SkeletalAnimationSystem reads every frame, so writing the field is the whole update.
// Nothing is persisted — the layout and playback are viewing aids, not calibration state.
export function createHGRPStageTab(): DebugTab {
  return {
    id: 'hgrp-stage',
    label: 'Stage',
    mount: (container) => {
      const pane = new Pane({ container });
      let animated = false;

      pane
        .addBinding(hgrpStagePlacement, 'globalScale', { min: 0.1, max: 20, step: 0.1 })
        .on('change', applyAllHGRPPlacements);

      for (const placement of hgrpStagePlacement.characters) {
        const folder = pane.addFolder({ title: placement.label, expanded: true });
        addPlacementWidgets(folder, placement, pane);
        animated = addAnimationWidgets(folder, placement.entity) || animated;
      }

      // Playback advances outside the panel: repaint every frame so the time scrub follows
      // the clip, the way the camera panel follows viewport drags.
      let frame = 0;
      if (animated) {
        frame = requestAnimationFrame(function sync() {
          pane.refresh();
          frame = requestAnimationFrame(sync);
        });
      }

      return () => {
        cancelAnimationFrame(frame);
        pane.dispose();
      };
    },
  };
}

function addPlacementWidgets(
  folder: FolderApi,
  placement: HGRPCharacterPlacement,
  pane: Pane,
): void {
  const apply = () => applyHGRPPlacement(placement);
  for (const axis of ['x', 'y', 'z'] as const) {
    folder
      .addBinding(placement.offset, axis, { label: `offset ${axis}`, step: 0.05 })
      .on('change', apply);
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    folder
      .addBinding(placement.rotation, axis, {
        label: `rotate ${axis}`,
        min: -180,
        max: 180,
        step: 1,
      })
      .on('change', apply);
  }
  folder.addBinding(placement, 'scale', { min: 0.1, max: 10, step: 0.05 }).on('change', apply);
  folder.addButton({ title: 'Reset placement' }).on('click', () => {
    resetHGRPPlacement(placement);
    pane.refresh();
  });
}

// The clips a character can play come from its glTF document (converted Unity clips,
// scripts/hgrp/anim-convert.mjs); a model without clips gets no playback widgets.
function animationClips(entity: Entity): GLTFAnimation[] {
  const mesh = entity.getComponent<Mesh3DComponent>(Mesh3DComponent.componentName);
  const assetId = mesh?.descriptor.type === 'gltf' ? mesh.descriptor.assetId : undefined;
  if (!assetId) {
    return [];
  }
  const model = assetRegistry.getAssetDescriptor<'gltf'>(assetId)?.rawData as GLTFModel | undefined;
  return model?.animations ?? [];
}

// Returns whether playback widgets were added (the caller then repaints per frame).
function addAnimationWidgets(folder: FolderApi, entity: Entity): boolean {
  const skeleton = entity.getComponent<SkeletonComponent>(SkeletonComponent.componentName);
  const clips = animationClips(entity);
  if (!skeleton || clips.length === 0) {
    return false;
  }

  const animation = folder.addFolder({ title: 'Animation', expanded: true });
  const options = Object.fromEntries(
    clips.map((clip, index) => [`${index}: ${clip.name} (${clip.duration.toFixed(2)}s)`, index]),
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

  // The scrub slider spans the current clip; a clip change rebuilds it with the new duration
  // (tweakpane bindings take their range at creation).
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
  return true;
}
