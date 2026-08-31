import { RectArea } from '@ecs/types/types';

/**
 * Transitional seam for the dormant 2D gameplay systems (Recycle, Weapon,
 * Border, ParallelCollision, ForceField): their former viewport authority —
 * the canvas2d RenderSystem — was removed with the 2D rendering pipeline, and
 * none of these systems is registered by the current 3D client. Until the
 * legacy-2D decision (architecture roadmap Phase 2) either deletes or ports
 * them, they read the screen rect here instead of a dead singleton.
 */
export function getScreenViewport(): RectArea {
  return [0, 0, window.innerWidth, window.innerHeight];
}
