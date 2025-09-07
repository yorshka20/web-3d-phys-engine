import {
  ActiveCameraTag,
  Camera3DComponent,
  CameraControlComponent,
  Transform3DComponent,
} from '@ecs/components';
import {
  CameraControlMode,
  DEFAULT_CAMERA_CONTROLS,
} from '@ecs/components/rendering/camera/CameraControlTypes';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Vec3 } from '@ecs/types/types';

/**
 * CameraModeManager provides utilities for managing camera control modes
 * and switching between different camera behaviors
 */
export class CameraModeManager {
  /**
   * Switch camera to FPS mode
   */
  static switchToFPSMode(entity: Entity): void {
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );

    if (camera) {
      camera.setControlMode('fps');
    }

    if (control) {
      control.setMode('fps');
    } else {
      // Create new control component if it doesn't exist
      entity.addComponent(new CameraControlComponent({ mode: 'fps' }));
    }
  }

  /**
   * Switch camera to orbit mode
   */
  static switchToOrbitMode(entity: Entity, target?: Vec3): void {
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );

    if (camera) {
      camera.setControlMode('orbit');
      if (target) {
        camera.setTarget(target);
      }
    }

    if (control) {
      control.setMode('orbit');
      if (target) {
        const config = control.getOrbitConfig();
        if (config) {
          config.target[0] = target[0];
          config.target[1] = target[1];
          config.target[2] = target[2];
        }
      }
    } else {
      // Create new control component if it doesn't exist
      entity.addComponent(
        new CameraControlComponent({
          mode: 'orbit',
          config: target
            ? {
                orbit: {
                  ...DEFAULT_CAMERA_CONTROLS.orbit.orbit!,
                  target,
                },
              }
            : undefined,
        }),
      );
    }
  }

  /**
   * Switch camera to free mode
   */
  static switchToFreeMode(entity: Entity): void {
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );

    if (camera) {
      camera.setControlMode('free');
    }

    if (control) {
      control.setMode('free');
    } else {
      // Create new control component if it doesn't exist
      entity.addComponent(new CameraControlComponent({ mode: 'free' }));
    }
  }

  /**
   * Switch camera to fixed mode
   */
  static switchToFixedMode(entity: Entity): void {
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );

    if (camera) {
      camera.setControlMode('fixed');
    }

    if (control) {
      control.setMode('fixed');
    } else {
      // Create new control component if it doesn't exist
      entity.addComponent(new CameraControlComponent({ mode: 'fixed' }));
    }
  }

  /**
   * Get current camera control mode
   */
  static getCurrentMode(entity: Entity): CameraControlMode | null {
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    return control ? control.getMode() : null;
  }

  /**
   * Check if camera is in a specific mode
   */
  static isInMode(entity: Entity, mode: CameraControlMode): boolean {
    return this.getCurrentMode(entity) === mode;
  }

  /**
   * Create a camera entity with specific control mode
   */
  static createCameraWithMode(
    mode: CameraControlMode,
    _position: Vec3 = [0, 0, 10],
    _target?: Vec3,
  ): Entity {
    // This would need to be called from within a World context
    // For now, return a mock entity structure
    throw new Error('createCameraWithMode must be called from within a World context');
  }

  /**
   * Setup camera for orbit mode with proper positioning
   */
  static setupOrbitCamera(entity: Entity, target: Vec3 = [0, 0, 0], distance: number = 10): void {
    const transform = entity.getComponent<Transform3DComponent>(Transform3DComponent.componentName);
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );

    if (!transform || !camera || !control) return;

    // Switch to orbit mode
    this.switchToOrbitMode(entity, target);

    // Position camera at distance from target
    const position: Vec3 = [
      target[0],
      target[1] + distance * 0.5, // Slightly above target
      target[2] + distance,
    ];
    transform.setPosition(position);

    // Update orbit state
    const orbitState = control.getOrbitState();
    if (orbitState) {
      orbitState.distance = distance;
      orbitState.azimuth = 0;
      orbitState.elevation = 0;
    }
  }

  /**
   * Setup camera for FPS mode
   */
  static setupFPSCamera(entity: Entity, position: Vec3 = [0, 0, 10]): void {
    const transform = entity.getComponent<Transform3DComponent>(Transform3DComponent.componentName);
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);

    if (!transform || !camera) return;

    // Switch to FPS mode
    this.switchToFPSMode(entity);

    // Set position
    transform.setPosition(position);

    // Reset camera rotation
    camera.facing = 0;
    camera.pitch = 0;
    camera.roll = 0;
  }

  /**
   * Get all camera entities in the world
   */
  static getCameraEntities(world: World): Entity[] {
    return world.getEntitiesWithComponents([Camera3DComponent, ActiveCameraTag]);
  }

  /**
   * Get the active camera entity
   */
  static getActiveCamera(world: World): Entity | null {
    const cameras = this.getCameraEntities(world);
    return cameras.length > 0 ? cameras[0] : null;
  }

  /**
   * Switch active camera to a specific mode
   */
  static switchActiveCameraMode(world: World, mode: CameraControlMode, target?: Vec3): boolean {
    const activeCamera = this.getActiveCamera(world);
    if (!activeCamera) return false;

    switch (mode) {
      case 'fps':
        this.switchToFPSMode(activeCamera);
        break;
      case 'orbit':
        this.switchToOrbitMode(activeCamera, target);
        break;
      case 'free':
        this.switchToFreeMode(activeCamera);
        break;
      case 'fixed':
        this.switchToFixedMode(activeCamera);
        break;
    }

    return true;
  }

  /**
   * Cycle through camera modes
   */
  static cycleCameraMode(world: World): CameraControlMode | null {
    const activeCamera = this.getActiveCamera(world);
    if (!activeCamera) return null;

    const currentMode = this.getCurrentMode(activeCamera);
    const modes: CameraControlMode[] = ['fps', 'orbit', 'free', 'fixed'];
    const currentIndex = modes.indexOf(currentMode || 'fps');
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];

    this.switchActiveCameraMode(world, nextMode);
    return nextMode;
  }
}
