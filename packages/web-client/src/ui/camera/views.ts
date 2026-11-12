import { CameraControlComponent, Entity, OrbitCameraControlSystem, World } from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { registerShortcut } from '../shortcuts';

export interface WorldSphere {
  center: [number, number, number];
  radius: number;
}

// The named angles a showcase screen cycles through. Azimuth 0 looks down -z at the
// character's front (the row faces +z); elevation is signed up.
export interface CameraViewPreset {
  id: string;
  label: string;
  key?: string;
  azimuth: number;
  elevation: number;
}

const degrees = (value: number) => (value * Math.PI) / 180;

export const CAMERA_VIEW_PRESETS: readonly CameraViewPreset[] = [
  { id: 'front', label: 'Front', key: '1', azimuth: 0, elevation: degrees(4) },
  { id: 'three-quarter', label: 'Three-quarter', azimuth: degrees(35), elevation: degrees(10) },
  { id: 'side', label: 'Side', key: '3', azimuth: degrees(90), elevation: degrees(4) },
  { id: 'back', label: 'Back', azimuth: degrees(180), elevation: degrees(4) },
  { id: 'top', label: 'Top', key: '7', azimuth: 0, elevation: degrees(80) },
];

// What F and a view preset frame: the stage that has characters on it says which sphere,
// and says nothing when there is nothing to frame (the camera then keeps its target).
export interface FocusProvider {
  // The sphere to frame for the whole-figure views
  body(): WorldSphere | undefined;
  // The sphere to frame for the face close-up
  head(): WorldSphere | undefined;
}

let provider: FocusProvider | undefined;

export function setFocusProvider(next: FocusProvider | undefined): void {
  provider = next;
}

/**
 * The camera moves the UI can ask for: presets, focus and reset, all through the orbit
 * system's view API so each one arrives as a damped transition.
 */
export class CameraViews {
  private readonly orbit: OrbitCameraControlSystem | null;

  constructor(
    world: World,
    private readonly camera: Entity,
  ) {
    this.orbit = world.getSystem<OrbitCameraControlSystem>(
      'OrbitCameraControlSystem',
      SystemPriorities.INPUT,
    );
  }

  preset(id: string): void {
    const preset = CAMERA_VIEW_PRESETS.find((entry) => entry.id === id);
    if (!preset || !this.orbit) return;
    const sphere = provider?.body();
    if (sphere) {
      this.orbit.frame(this.camera, sphere, preset);
    } else {
      this.orbit.setView(this.camera, preset);
    }
  }

  // Frame the body; the angles stay where the user left them
  focus(): void {
    const sphere = provider?.body();
    if (sphere) this.orbit?.frame(this.camera, sphere);
  }

  // A portrait: the head sphere from a slightly raised front three-quarter
  face(): void {
    const sphere = provider?.head();
    if (sphere) {
      this.orbit?.frame(this.camera, sphere, {
        azimuth: degrees(20),
        elevation: degrees(6),
        padding: 1.4,
      });
    }
  }

  frame(sphere: WorldSphere): void {
    this.orbit?.frame(this.camera, sphere);
  }

  reset(): void {
    this.orbit?.resetView(this.camera);
  }

  current() {
    return this.camera
      .getComponent<CameraControlComponent>(CameraControlComponent.componentName)
      ?.getOrbitGoal();
  }
}

let installed: CameraViews | undefined;

/**
 * Create the app's camera views and bind their keys. One per app, installed by main once the
 * camera entity exists: the camera is global, like its panel, and the stages reach it here.
 */
export function installCameraViews(world: World, camera: Entity): CameraViews {
  installed = new CameraViews(world, camera);
  registerCameraShortcuts(installed);
  return installed;
}

export function cameraViews(): CameraViews {
  if (!installed) {
    throw new Error('[cameraViews] installCameraViews has not run');
  }
  return installed;
}

function registerCameraShortcuts(views: CameraViews): void {
  registerShortcut({
    code: 'KeyF',
    key: 'F',
    description: 'Frame the character',
    handler: () => views.focus(),
  });
  registerShortcut({
    code: 'KeyG',
    key: 'G',
    description: 'Face close-up',
    handler: () => views.face(),
  });
  registerShortcut({
    code: 'Home',
    key: 'Home',
    description: 'Reset the view',
    handler: () => views.reset(),
  });
  for (const preset of CAMERA_VIEW_PRESETS) {
    if (!preset.key) continue;
    registerShortcut({
      code: `Digit${preset.key}`,
      key: preset.key,
      description: `${preset.label} view`,
      handler: () => views.preset(preset.id),
    });
  }
}
