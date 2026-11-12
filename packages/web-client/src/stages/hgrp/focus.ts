import { Entity, World } from '@ecs';
import { ActiveCameraTag } from '@ecs/components';
import { onSceneDoubleClick } from '../../ui/camera/pick';
import { cameraViews, setFocusProvider, WorldSphere } from '../../ui/camera/views';
import {
  hgrpCharacterHeadSphere,
  hgrpCharacterSphere,
  hgrpStage,
  HGRPStageCharacter,
} from './characters';

// Which character the camera keys and the showcase act on. Nothing is focused until the user
// picks one (double-click, the character strip): then F frames everyone on stage together.
export const hgrpFocus = {
  assetId: undefined as string | undefined,
};

const listeners = new Set<() => void>();

export function onHGRPFocusChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function focusedHGRPCharacter(): HGRPStageCharacter | undefined {
  return hgrpStage.characters.find(
    (character) => character.assetId === hgrpFocus.assetId && character.entity && character.visible,
  );
}

/**
 * Focus a character: it becomes what the keys act on, and the camera frames it. `undefined`
 * clears the focus (the keys then frame the whole stage).
 */
export function focusHGRPCharacter(assetId: string | undefined, frame = true): void {
  hgrpFocus.assetId = assetId;
  for (const listener of listeners) listener();
  if (frame) cameraViews().focus();
}

function onStage(): HGRPStageCharacter[] {
  return hgrpStage.characters.filter((character) => character.entity && character.visible);
}

// The sphere around every character on stage: the smallest-enclosing sphere of their spheres
// (good enough for a row — the sphere of the farthest-apart pair contains the rest)
function stageSphere(): WorldSphere | undefined {
  const spheres = onStage()
    .map(hgrpCharacterSphere)
    .filter((sphere): sphere is WorldSphere => sphere !== undefined);
  if (spheres.length === 0) return undefined;
  let best = spheres[0];
  for (const a of spheres) {
    for (const b of spheres) {
      const dx = b.center[0] - a.center[0];
      const dy = b.center[1] - a.center[1];
      const dz = b.center[2] - a.center[2];
      const gap = Math.hypot(dx, dy, dz);
      const radius = (gap + a.radius + b.radius) / 2;
      if (radius <= best.radius) continue;
      const t = gap > 0 ? (radius - a.radius) / gap : 0;
      best = {
        center: [a.center[0] + dx * t, a.center[1] + dy * t, a.center[2] + dz * t],
        radius,
      };
    }
  }
  return best;
}

/**
 * Wire the stage's characters into the camera: what F / the presets frame, and the
 * double-click that picks a character. Called once by the stage.
 */
export function installHGRPFocus(world: World): () => void {
  setFocusProvider({
    body: () => {
      const focused = focusedHGRPCharacter();
      return focused ? hgrpCharacterSphere(focused) : stageSphere();
    },
    head: () => {
      const character = focusedHGRPCharacter() ?? onStage()[0];
      return character && hgrpCharacterHeadSphere(character);
    },
  });
  const camera = world.getEntitiesWithComponents([ActiveCameraTag])[0] as Entity | undefined;
  if (!camera) {
    return () => setFocusProvider(undefined);
  }
  const unpick = onSceneDoubleClick(
    camera,
    () =>
      onStage().flatMap((character) => {
        const sphere = hgrpCharacterSphere(character);
        return sphere ? [{ item: character, sphere }] : [];
      }),
    (character) => focusHGRPCharacter(character.assetId),
  );
  return () => {
    unpick();
    setFocusProvider(undefined);
  };
}
