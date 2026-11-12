import {
  ActiveCameraTag,
  Camera3DComponent,
  CameraControlComponent,
  Input3DComponent,
  Transform3DComponent,
} from '@ecs/components';
import {
  CameraControlConfig,
  CameraControlState,
  OrbitView,
} from '@ecs/components/rendering/camera/CameraControlTypes';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { CameraTargetIndicator } from '@ecs/helpers/CameraTargetIndicator';
import { Vec3 } from '@ecs/types/types';
import { isSceneSurfaceEvent } from '@ecs/utils/sceneSurface';

/**
 * A bounding sphere, what the view API frames.
 */
export interface BoundingSphere {
  center: Vec3;
  radius: number;
}

/**
 * OrbitCameraControlSystem handles 3D modeling software-style camera controls
 * - Camera always looks at a target point (usually origin)
 * - Mouse drag rotates around the target
 * - WASD keys pan the camera
 * - Mouse wheel zooms in/out, toward the cursor when the config says so
 * - Right mouse button can be used for additional controls
 *
 * Input writes the GOAL view on the control component; every tick the rendered view takes
 * an exponential step toward it (config.damping), so a drag settles instead of stopping
 * dead and a preset or focus request arrives as a transition. The view API (setView, frame,
 * resetView) is the one entry for anything that moves the camera programmatically.
 */
export class OrbitCameraControlSystem extends System {
  private targetIndicator: CameraTargetIndicator | null = null;
  private showTargetIndicator: boolean = true;

  constructor() {
    super('OrbitCameraControlSystem', SystemPriorities.INPUT, 'logic');
  }

  init(): void {
    // Add mouse wheel event listener for zoom
    document.addEventListener('wheel', this.handleMouseWheel, { passive: false });
    document.addEventListener('keydown', this.handleKeyDown, { passive: false });

    // Initialize target indicator
    this.targetIndicator = new CameraTargetIndicator(this.world, this);
    this.targetIndicator.createIndicator();
  }

  destroy(): void {
    // Remove mouse wheel event listener
    document.removeEventListener('wheel', this.handleMouseWheel);
    document.removeEventListener('keydown', this.handleKeyDown);
    // Destroy target indicator
    if (this.targetIndicator) {
      this.targetIndicator.destroyIndicator();
      this.targetIndicator = null;
    }
  }

  update(deltaTime: number): void {
    // Handle orbit camera controls for active cameras
    const cameraEntities = this.world.getEntitiesWithComponents([
      Transform3DComponent,
      Camera3DComponent,
      CameraControlComponent,
      ActiveCameraTag,
    ]);

    for (const entity of cameraEntities) {
      const control = entity.getComponent<CameraControlComponent>(
        CameraControlComponent.componentName,
      );
      if (!control || !control.isOrbitMode()) continue;

      this.handleOrbitCameraControl(entity, deltaTime);

      // Update target indicator position
      if (this.targetIndicator && this.showTargetIndicator) {
        this.targetIndicator.updateIndicatorPosition(entity);
      }
    }
  }

  /**
   * Handle orbit camera control for a specific entity
   */
  private handleOrbitCameraControl(entity: Entity, deltaTime: number): void {
    const transform = entity.getComponent<Transform3DComponent>(Transform3DComponent.componentName);
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    const input = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);

    if (!transform || !camera || !control || !input) return;

    const config = control.getOrbitConfig();
    const state = control.getOrbitState();

    if (!config || !state) return;

    // Handle mouse input for rotation and zoom
    this.handleMouseInput(entity, control, input, config, state);

    // Handle keyboard input for panning
    this.handleKeyboardPanning(entity, transform, input, config, deltaTime);

    this.approachGoal(config, state, deltaTime);

    // Update camera position based on orbit parameters
    this.updateCameraPosition(transform, camera, config, state);

    // Update camera to look at target
    this.updateCameraLookAt(camera, config);
  }

  /**
   * Handle mouse input for orbit camera
   */
  private handleMouseInput(
    entity: Entity,
    control: CameraControlComponent,
    input: Input3DComponent,
    config: NonNullable<CameraControlConfig['orbit']>,
    state: NonNullable<CameraControlState['orbit']>,
  ): void {
    const [mouseDeltaX, mouseDeltaY] = input.getMouseDelta();
    const inputState = input.getState();

    if (mouseDeltaX === 0 && mouseDeltaY === 0) return;

    // Left mouse button: rotate around target
    if (inputState.mouseButtons.has(0) && config.enableRotation) {
      const sensitivity = config.rotationSensitivity;

      // Update azimuth (horizontal rotation around Y axis)
      state.goalAzimuth -= mouseDeltaX * sensitivity;

      // Update elevation (vertical rotation around X axis)
      state.goalElevation += mouseDeltaY * sensitivity;

      // Clamp elevation to prevent over-rotation
      state.goalElevation = clampElevation(state.goalElevation);
    }

    // Right mouse button: pan the target
    if (inputState.mouseButtons.has(2) && config.enablePan) {
      this.handleMousePanning(entity, control, mouseDeltaX, mouseDeltaY, config);
    }

    // Clear mouse delta after processing
    input.clearMouseDelta();
  }

  /**
   * Handle mouse panning (right mouse button)
   * Panning moves the target point in camera space
   */
  private handleMousePanning(
    entity: Entity,
    control: CameraControlComponent,
    deltaX: number,
    deltaY: number,
    config: NonNullable<CameraControlConfig['orbit']>,
  ): void {
    const transform = entity.getComponent<Transform3DComponent>(Transform3DComponent.componentName);
    if (!transform) return;

    const state = control.getOrbitState();
    if (!state) return;
    const sensitivity = config.panSensitivity;
    const position = transform.getPosition();
    const target = config.target;

    // Calculate camera's right and up vectors relative to target
    const [right, up] = this.getCameraRightAndUpVectors(position, target);

    // Pan the target in camera space
    const panX = right[0] * deltaX * sensitivity;
    const panY = right[1] * deltaX * sensitivity;
    const panZ = right[2] * deltaX * sensitivity;

    const panUpX = up[0] * deltaY * sensitivity;
    const panUpY = up[1] * deltaY * sensitivity;
    const panUpZ = up[2] * deltaY * sensitivity;

    // Update target position
    state.goalTarget[0] += panX + panUpX;
    state.goalTarget[1] += panY + panUpY;
    state.goalTarget[2] += panZ + panUpZ;
  }

  /**
   * Handle keyboard movement (WASD keys) - move target point
   */
  private handleKeyboardPanning(
    entity: Entity,
    transform: Transform3DComponent,
    input: Input3DComponent,
    config: NonNullable<CameraControlConfig['orbit']>,
    deltaTime: number,
  ): void {
    const inputState = input.getState();
    const state = entity
      .getComponent<CameraControlComponent>(CameraControlComponent.componentName)
      ?.getOrbitState();
    if (!state) return;
    const baseMoveSpeed = config.moveSpeed || 5.0; // units per second
    const sprintMultiplier = inputState.sprint ? 3.0 : 1.0; // Sprint speed multiplier
    const moveSpeed = baseMoveSpeed * sprintMultiplier;

    let moveX = 0,
      moveY = 0,
      moveZ = 0;

    // Calculate movement direction based on camera orientation
    const position = transform.getPosition();
    const target = config.target;
    const [right, , forward] = this.getCameraRightUpForwardVectors(position, target);

    // WASD movement in camera space
    if (inputState.forward) {
      moveX += forward[0];
      moveY += forward[1];
      moveZ += forward[2];
    }
    if (inputState.backward) {
      moveX -= forward[0];
      moveY -= forward[1];
      moveZ -= forward[2];
    }
    if (inputState.right) {
      moveX += right[0];
      moveY += right[1];
      moveZ += right[2];
    }
    if (inputState.left) {
      moveX -= right[0];
      moveY -= right[1];
      moveZ -= right[2];
    }
    if (inputState.up) {
      moveY += 1; // Always move up in world Y direction
    }
    if (inputState.down) {
      moveY -= 1; // Always move down in world Y direction
    }

    // Apply movement to target point
    if (moveX !== 0 || moveY !== 0 || moveZ !== 0) {
      const distance = Math.sqrt(moveX * moveX + moveY * moveY + moveZ * moveZ);
      if (distance > 0) {
        const normalizedMoveX = (moveX / distance) * moveSpeed * deltaTime;
        const normalizedMoveY = (moveY / distance) * moveSpeed * deltaTime;
        const normalizedMoveZ = (moveZ / distance) * moveSpeed * deltaTime;

        // Move the target point
        state.goalTarget[0] += normalizedMoveX;
        state.goalTarget[1] += normalizedMoveY;
        state.goalTarget[2] += normalizedMoveZ;
      }
    }
  }

  /**
   * One exponential step of the rendered view toward the goal. Azimuth takes the short way
   * round, and both angles are re-centred together once the rendered one leaves [-PI, PI], so
   * a drag that keeps turning never accumulates an unbounded angle.
   */
  private approachGoal(
    config: NonNullable<CameraControlConfig['orbit']>,
    state: NonNullable<CameraControlState['orbit']>,
    deltaTime: number,
  ): void {
    const k = config.damping > 0 ? 1 - Math.exp(-deltaTime / config.damping) : 1;
    state.azimuth += shortestTurn(state.goalAzimuth - state.azimuth) * k;
    state.elevation += (state.goalElevation - state.elevation) * k;
    state.distance += (state.goalDistance - state.distance) * k;
    const target = config.target;
    for (let i = 0; i < 3; i++) {
      target[i] += (state.goalTarget[i] - target[i]) * k;
    }
    if (Math.abs(state.azimuth) > Math.PI) {
      const shift = 2 * Math.PI * Math.round(state.azimuth / (2 * Math.PI));
      state.azimuth -= shift;
      state.goalAzimuth -= shift;
    }
  }

  /**
   * Move the camera to (part of) a view. Animated by default — the view becomes the goal
   * and the damping carries the camera there; `animate: false` lands it this tick.
   */
  setView(entity: Entity, view: Partial<OrbitView>, options: { animate?: boolean } = {}): void {
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    const config = control?.getOrbitConfig();
    if (!control || !config || !control.isOrbitMode()) return;
    const clamped: Partial<OrbitView> = { ...view };
    if (view.distance !== undefined) {
      clamped.distance = Math.max(config.minDistance, Math.min(config.maxDistance, view.distance));
    }
    if (view.elevation !== undefined) {
      clamped.elevation = clampElevation(view.elevation);
    }
    if (options.animate === false) {
      control.updateOrbitState(clamped);
    } else {
      control.setOrbitGoal(clamped);
    }
  }

  /**
   * Point the camera at a sphere and back off until it fills the view: the distance that
   * puts the sphere's silhouette at `padding` times the frame height (vertical field of
   * view). Angles stay unless given.
   */
  frame(
    entity: Entity,
    sphere: BoundingSphere,
    options: { azimuth?: number; elevation?: number; padding?: number; animate?: boolean } = {},
  ): void {
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    if (!camera) return;
    const halfFov = ((camera.fov / 2) * Math.PI) / 180;
    const padding = options.padding ?? 1.15;
    const distance = (Math.max(sphere.radius, 1e-3) * padding) / Math.sin(halfFov);
    this.setView(
      entity,
      {
        target: [sphere.center[0], sphere.center[1], sphere.center[2]],
        distance,
        azimuth: options.azimuth,
        elevation: options.elevation,
      },
      options,
    );
  }

  /** Back to the view the stage set up (CameraControlComponent.setOrbitHome). */
  resetView(entity: Entity, options: { animate?: boolean } = {}): void {
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    const home = control?.getOrbitHome();
    if (!home) return;
    this.setView(entity, home, options);
  }

  /**
   * Update camera position based on orbit parameters
   * Orbit around the configured target point
   */
  private updateCameraPosition(
    transform: Transform3DComponent,
    camera: Camera3DComponent,
    config: NonNullable<CameraControlConfig['orbit']>,
    state: NonNullable<CameraControlState['orbit']>,
  ): void {
    const target = config.target;
    const distance = state.distance;

    // Calculate position based on spherical coordinates around target
    const x = target[0] + distance * Math.cos(state.elevation) * Math.sin(state.azimuth);
    const y = target[1] + distance * Math.sin(state.elevation);
    const z = target[2] + distance * Math.cos(state.elevation) * Math.cos(state.azimuth);

    transform.setPosition([x, y, z]);
  }

  /**
   * Update camera to look at target
   */
  private updateCameraLookAt(
    camera: Camera3DComponent,
    config: NonNullable<CameraControlConfig['orbit']>,
  ): void {
    // Look at the configured target point
    camera.setTarget(config.target);
  }

  /**
   * Get camera's right and up vectors
   */
  private getCameraRightAndUpVectors(position: Vec3, target: Vec3): [Vec3, Vec3] {
    const forward: Vec3 = [
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ];

    // Normalize forward vector
    const length = Math.sqrt(forward[0] ** 2 + forward[1] ** 2 + forward[2] ** 2);
    if (length > 0) {
      forward[0] /= length;
      forward[1] /= length;
      forward[2] /= length;
    }

    // Calculate right vector (cross product of forward and world up)
    const worldUp: Vec3 = [0, 1, 0];
    const right: Vec3 = [
      forward[1] * worldUp[2] - forward[2] * worldUp[1],
      forward[2] * worldUp[0] - forward[0] * worldUp[2],
      forward[0] * worldUp[1] - forward[1] * worldUp[0],
    ];

    // Normalize right vector
    const rightLength = Math.sqrt(right[0] ** 2 + right[1] ** 2 + right[2] ** 2);
    if (rightLength > 0) {
      right[0] /= rightLength;
      right[1] /= rightLength;
      right[2] /= rightLength;
    }

    // Calculate up vector (cross product of right and forward)
    const up: Vec3 = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];

    return [right, up];
  }

  /**
   * Get camera's right, up, and forward vectors
   */
  private getCameraRightUpForwardVectors(position: Vec3, target: Vec3): [Vec3, Vec3, Vec3] {
    const [right, up] = this.getCameraRightAndUpVectors(position, target);

    const forward: Vec3 = [
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ];

    // Normalize forward vector
    const length = Math.sqrt(forward[0] ** 2 + forward[1] ** 2 + forward[2] ** 2);
    if (length > 0) {
      forward[0] /= length;
      forward[1] /= length;
      forward[2] /= length;
    }

    return [right, up, forward];
  }

  /**
   * Update orbit state from a given camera position
   * Converts Cartesian coordinates to spherical coordinates around target
   */
  private updateOrbitStateFromPosition(control: CameraControlComponent, position: Vec3): void {
    const state = control.getOrbitState();
    const config = control.getOrbitConfig();
    if (!state || !config) return;

    const target = config.target;

    // Calculate relative position from target
    const relativeX = position[0] - target[0];
    const relativeY = position[1] - target[1];
    const relativeZ = position[2] - target[2];

    // Calculate distance from target
    const distance = Math.sqrt(
      relativeX * relativeX + relativeY * relativeY + relativeZ * relativeZ,
    );

    if (distance > 0) {
      control.updateOrbitState({
        elevation: Math.asin(relativeY / distance),
        azimuth: Math.atan2(relativeX, relativeZ),
        distance,
      });
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 't':
      case 'T':
        // toggle target indicator visibility
        this.toggleTargetIndicator();
        break;
    }
  };

  /**
   * Handle mouse wheel zoom
   */
  private handleMouseWheel = (event: WheelEvent): void => {
    // Zoom only when scrolling the scene surface: over UI overlays the wheel belongs to the
    // panel (no zoom, no preventDefault, so panel scrolling keeps working).
    if (!isSceneSurfaceEvent(event)) return;

    // Find active orbit cameras
    const cameraEntities = this.world.getEntitiesWithComponents([
      Camera3DComponent,
      CameraControlComponent,
      ActiveCameraTag,
    ]);

    for (const entity of cameraEntities) {
      const control = entity.getComponent<CameraControlComponent>(
        CameraControlComponent.componentName,
      );
      if (!control || !control.isOrbitMode()) continue;

      const config = control.getOrbitConfig();
      const state = control.getOrbitState();

      if (!config || !state || !config.enableZoom) continue;

      // Prevent default scrolling behavior
      event.preventDefault();

      // Calculate zoom factor based on wheel delta
      // Positive deltaY = scroll down = zoom out (increase distance)
      // Negative deltaY = scroll up = zoom in (decrease distance)
      const zoomDelta = -event.deltaY * config.zoomSensitivity;

      // Apply zoom with exponential scaling for smoother control
      const zoomFactor = Math.exp(zoomDelta);
      const previous = state.goalDistance;
      state.goalDistance = Math.max(
        config.minDistance,
        Math.min(config.maxDistance, state.goalDistance * zoomFactor),
      );

      // Dolly toward the cursor: the point under the cursor on the target's plane keeps its
      // place on screen when the target slides toward it by the share of the distance that
      // was removed (a focal-plane dolly, which needs no depth).
      if (config.zoomToCursor && previous > 0) {
        const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
        const surface = event.target as HTMLElement;
        if (camera && surface.getBoundingClientRect) {
          const rect = surface.getBoundingClientRect();
          const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
          const underCursor = pointOnTargetPlane(
            state.goalTarget,
            state.goalAzimuth,
            state.goalElevation,
            previous,
            camera.fov,
            camera.getAspectRatio(),
            ndcX,
            ndcY,
          );
          const share = 1 - state.goalDistance / previous;
          for (let i = 0; i < 3; i++) {
            state.goalTarget[i] += (underCursor[i] - state.goalTarget[i]) * share;
          }
        }
      }
    }
  };

  /**
   * Handle mouse wheel zoom for specific entity (legacy method)
   */
  handleMouseWheelForEntity(entity: Entity, delta: number): void {
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    if (!control || !control.isOrbitMode()) return;

    const config = control.getOrbitConfig();
    const state = control.getOrbitState();

    if (!config || !state || !config.enableZoom) return;

    // Calculate zoom factor based on wheel delta
    // Positive delta = zoom out (increase distance)
    // Negative delta = zoom in (decrease distance)
    const zoomDelta = -delta * config.zoomSensitivity;

    // Apply zoom with exponential scaling for smoother control
    const zoomFactor = Math.exp(zoomDelta);
    state.goalDistance = Math.max(
      config.minDistance,
      Math.min(config.maxDistance, state.goalDistance * zoomFactor),
    );
  }

  /**
   * Set orbit target
   */
  setOrbitTarget(entity: Entity, target: Vec3): void {
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    if (!control || !control.isOrbitMode()) return;

    control.updateOrbitState({ target: [target[0], target[1], target[2]] });
  }

  /**
   * Set orbit distance
   */
  setOrbitDistance(entity: Entity, distance: number): void {
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    if (!control || !control.isOrbitMode()) return;

    const config = control.getOrbitConfig();
    const state = control.getOrbitState();

    if (config && state) {
      control.updateOrbitState({
        distance: Math.max(config.minDistance, Math.min(config.maxDistance, distance)),
      });
    }
  }

  /**
   * Show/hide target indicator
   */
  setTargetIndicatorVisible(visible: boolean): void {
    this.showTargetIndicator = visible;
    if (this.targetIndicator) {
      this.targetIndicator.setVisible(visible);
    }
  }

  /**
   * Toggle target indicator visibility
   */
  toggleTargetIndicator(): void {
    this.showTargetIndicator = !this.showTargetIndicator;
    if (this.targetIndicator) {
      this.targetIndicator.toggleVisibility();
    }
  }

  /**
   * Get target indicator visibility state
   */
  isTargetIndicatorVisible(): boolean {
    return this.showTargetIndicator;
  }

  /**
   * Get target indicator instance
   */
  getTargetIndicator(): CameraTargetIndicator | null {
    return this.targetIndicator;
  }
}

const MAX_ELEVATION = Math.PI / 2 - 0.1; // 85 degrees

function clampElevation(elevation: number): number {
  return Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, elevation));
}

// The signed angle, in (-PI, PI], that turns by `delta` the short way round
function shortestTurn(delta: number): number {
  const twoPi = 2 * Math.PI;
  return delta - twoPi * Math.round(delta / twoPi);
}

/**
 * The camera basis for an orbit view: unit forward (camera to target), right and up.
 */
export function orbitBasis(
  azimuth: number,
  elevation: number,
): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward: Vec3 = [
    -Math.cos(elevation) * Math.sin(azimuth),
    -Math.sin(elevation),
    -Math.cos(elevation) * Math.cos(azimuth),
  ];
  // Right = forward x worldUp, up = right x forward (both unit: forward is never vertical,
  // the elevation clamp keeps it 5 degrees off)
  const right: Vec3 = [-forward[2], 0, forward[0]];
  const rightLength = Math.hypot(right[0], right[2]);
  right[0] /= rightLength;
  right[2] /= rightLength;
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
}

/**
 * The world point a screen position (NDC, y up) sees on the plane through the target that
 * faces the camera, for a perspective lens of `fov` degrees (vertical).
 */
export function pointOnTargetPlane(
  target: Vec3,
  azimuth: number,
  elevation: number,
  distance: number,
  fov: number,
  aspectRatio: number,
  ndcX: number,
  ndcY: number,
): Vec3 {
  const { right, up } = orbitBasis(azimuth, elevation);
  const halfHeight = Math.tan(((fov / 2) * Math.PI) / 180) * distance;
  const halfWidth = halfHeight * aspectRatio;
  return [
    target[0] + right[0] * ndcX * halfWidth + up[0] * ndcY * halfHeight,
    target[1] + right[1] * ndcX * halfWidth + up[1] * ndcY * halfHeight,
    target[2] + right[2] * ndcX * halfWidth + up[2] * ndcY * halfHeight,
  ];
}

/**
 * The world-space ray a screen position (NDC, y up) casts from an orbit camera.
 */
export function orbitRay(
  azimuth: number,
  elevation: number,
  fov: number,
  aspectRatio: number,
  ndcX: number,
  ndcY: number,
): Vec3 {
  const { forward, right, up } = orbitBasis(azimuth, elevation);
  const halfHeight = Math.tan(((fov / 2) * Math.PI) / 180);
  const halfWidth = halfHeight * aspectRatio;
  const direction: Vec3 = [
    forward[0] + right[0] * ndcX * halfWidth + up[0] * ndcY * halfHeight,
    forward[1] + right[1] * ndcX * halfWidth + up[1] * ndcY * halfHeight,
    forward[2] + right[2] * ndcX * halfWidth + up[2] * ndcY * halfHeight,
  ];
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  direction[0] /= length;
  direction[1] /= length;
  direction[2] /= length;
  return direction;
}
