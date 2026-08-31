/**
 * Boundary between 3D scene input and DOM UI overlays: camera gestures must originate on a
 * marked render surface, so panels stacked above the canvas never drive the camera. The
 * surface owner marks its element; input systems test event origins against the mark.
 */

export function markSceneSurface(element: HTMLElement): void {
  element.dataset.sceneSurface = 'true';
}

export function isSceneSurfaceEvent(event: Event): boolean {
  return event.target instanceof HTMLElement && event.target.dataset.sceneSurface === 'true';
}
