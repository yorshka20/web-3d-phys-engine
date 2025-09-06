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
} from '@ecs/components/rendering/camera/CameraControlTypes';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Vec3 } from '@ecs/types/types';

/**
 * OrbitCameraControlSystem handles 3D modeling software-style camera controls
 * - Camera always looks at a target point (usually origin)
 * - Mouse drag rotates around the target
 * - WASD keys pan the camera
 * - Mouse wheel zooms in/out
 * - Right mouse button can be used for additional controls
 */
export class OrbitCameraControlSystem extends System {
  constructor() {
    super('OrbitCameraControlSystem', SystemPriorities.INPUT, 'logic');
  }

  init(): void {
    // Add mouse wheel event listener for zoom
    document.addEventListener('wheel', this.handleMouseWheel, { passive: false });
  }

  destroy(): void {
    // Remove mouse wheel event listener
    document.removeEventListener('wheel', this.handleMouseWheel);
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
      state.azimuth -= mouseDeltaX * sensitivity;

      // Update elevation (vertical rotation around X axis)
      state.elevation += mouseDeltaY * sensitivity;

      // Clamp elevation to prevent over-rotation
      const maxElevation = Math.PI / 2 - 0.1; // 85 degrees
      state.elevation = Math.max(-maxElevation, Math.min(maxElevation, state.elevation));

      // Normalize azimuth to [-PI, PI]
      while (state.azimuth > Math.PI) state.azimuth -= 2 * Math.PI;
      while (state.azimuth < -Math.PI) state.azimuth += 2 * Math.PI;
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

    const sensitivity = config.panSensitivity;
    const position = transform.getPosition();
    const target = config.target;

    // Calculate camera's right and up vectors
    const [right, up] = this.getCameraRightAndUpVectors(position, target);

    // Pan the target in camera space
    const panX = right[0] * deltaX * sensitivity;
    const panY = right[1] * deltaX * sensitivity;
    const panZ = right[2] * deltaX * sensitivity;

    const panUpX = up[0] * deltaY * sensitivity;
    const panUpY = up[1] * deltaY * sensitivity;
    const panUpZ = up[2] * deltaY * sensitivity;

    // Update target position
    config.target[0] += panX + panUpX;
    config.target[1] += panY + panUpY;
    config.target[2] += panZ + panUpZ;
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
    const moveSpeed = 5.0; // units per second

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
        config.target[0] += normalizedMoveX;
        config.target[1] += normalizedMoveY;
        config.target[2] += normalizedMoveZ;
      }
    }
  }

  /**
   * Update camera position based on orbit parameters
   */
  private updateCameraPosition(
    transform: Transform3DComponent,
    camera: Camera3DComponent,
    config: NonNullable<CameraControlConfig['orbit']>,
    state: NonNullable<CameraControlState['orbit']>,
  ): void {
    const target = config.target;
    const distance = state.distance;

    // Calculate position based on spherical coordinates
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
   * Handle mouse wheel zoom
   */
  private handleMouseWheel = (event: WheelEvent): void => {
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

      // Update distance based on wheel delta
      const zoomFactor = 1 - event.deltaY * config.zoomSensitivity;
      state.distance *= zoomFactor;

      // Clamp distance to min/max bounds
      state.distance = Math.max(config.minDistance, Math.min(config.maxDistance, state.distance));
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

    // Update distance based on wheel delta
    const zoomFactor = 1 + delta * config.zoomSensitivity;
    state.distance *= zoomFactor;

    // Clamp distance to min/max bounds
    state.distance = Math.max(config.minDistance, Math.min(config.maxDistance, state.distance));
  }

  /**
   * Set orbit target
   */
  setOrbitTarget(entity: Entity, target: Vec3): void {
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    if (!control || !control.isOrbitMode()) return;

    const config = control.getOrbitConfig();
    if (config) {
      config.target[0] = target[0];
      config.target[1] = target[1];
      config.target[2] = target[2];
    }
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
      state.distance = Math.max(config.minDistance, Math.min(config.maxDistance, distance));
    }
  }
}
