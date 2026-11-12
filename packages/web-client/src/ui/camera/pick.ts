import { Camera3DComponent, CameraControlComponent, Entity, orbitRay } from '@ecs';
import { isSceneSurfaceEvent } from '@ecs/utils/sceneSurface';
import type { WorldSphere } from './views';

export interface Pickable<T> {
  item: T;
  sphere: WorldSphere;
}

/**
 * Double-click on the scene picks the nearest sphere under the cursor. Spheres, not meshes:
 * the camera's own targets are the characters' bounding spheres, and a ray-sphere test needs
 * no depth readback or picking pass.
 */
export function onSceneDoubleClick<T>(
  camera: Entity,
  candidates: () => Pickable<T>[],
  onPick: (item: T) => void,
): () => void {
  const handler = (event: MouseEvent) => {
    if (!isSceneSurfaceEvent(event)) return;
    const control = camera.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    const lens = camera.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const state = control?.getOrbitState();
    const target = control?.getOrbitConfig()?.target;
    if (!state || !target || !lens) return;

    const surface = event.target as HTMLElement;
    const rect = surface.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    const direction = orbitRay(
      state.azimuth,
      state.elevation,
      lens.fov,
      lens.getAspectRatio(),
      ndcX,
      ndcY,
    );
    const origin = [
      target[0] + state.distance * Math.cos(state.elevation) * Math.sin(state.azimuth),
      target[1] + state.distance * Math.sin(state.elevation),
      target[2] + state.distance * Math.cos(state.elevation) * Math.cos(state.azimuth),
    ];

    let best: { item: T; distance: number } | undefined;
    for (const candidate of candidates()) {
      const hit = raySphere(origin, direction, candidate.sphere);
      if (hit !== undefined && (!best || hit < best.distance)) {
        best = { item: candidate.item, distance: hit };
      }
    }
    if (best) onPick(best.item);
  };
  document.addEventListener('dblclick', handler);
  return () => document.removeEventListener('dblclick', handler);
}

// Distance along the ray to the first intersection, or undefined
function raySphere(
  origin: ArrayLike<number>,
  direction: ArrayLike<number>,
  sphere: WorldSphere,
): number | undefined {
  const ox = origin[0] - sphere.center[0];
  const oy = origin[1] - sphere.center[1];
  const oz = origin[2] - sphere.center[2];
  const b = ox * direction[0] + oy * direction[1] + oz * direction[2];
  const c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return undefined;
  const t = -b - Math.sqrt(discriminant);
  return t >= 0 ? t : c < 0 ? 0 : undefined;
}
