import {
  ActiveCameraTag,
  Camera3DComponent,
  CameraControlComponent,
  Input3DComponent,
  PhysicsComponent,
  StatsComponent,
  Transform3DComponent,
} from '@ecs/components';
import { CameraControlMode } from '@ecs/components/rendering/camera/CameraControlTypes';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Vec3 } from '@ecs/types/types';

/**
 * CameraFactory provides convenient methods to create camera entities
 * that integrate with your ECS World system
 */
export class CameraFactory {
  /**
   * Create a complete FPS camera entity
   */
  static createFPSCamera(
    world: World,
    position: Vec3 = [0, 0, 10],
    fov: number = 75,
    aspectRatio: number = 16 / 9,
  ): Entity {
    const camera = world.createEntity('camera');

    // Add camera component using world.createComponent (your preferred way)
    camera.addComponent(
      world.createComponent(Camera3DComponent, {
        fov,
        aspectRatio,
        near: 0.1,
        far: 1000,
        projectionMode: 'perspective',
        cameraMode: 'custom',
        controlMode: 'fps',
      }),
    );

    // Add transform component
    camera.addComponent(
      world.createComponent(Transform3DComponent, {
        position,
        rotation: [0, 0, 0],
      }),
    );

    // Add control component
    camera.addComponent(
      world.createComponent(CameraControlComponent, {
        mode: 'fps',
      }),
    );

    // Add input component
    camera.addComponent(world.createComponent(Input3DComponent, {}));

    // Mark as active camera
    camera.addComponent(world.createComponent(ActiveCameraTag, {}));

    return camera;
  }

  /**
   * Create a complete orbit camera entity
   */
  static createOrbitCamera(
    world: World,
    target: Vec3 = [0, 0, 0],
    distance: number = 10,
    fov: number = 75,
    aspectRatio: number = 16 / 9,
  ): Entity {
    const camera = world.createEntity('camera');

    // Initial orbit parameters
    const azimuth = 0; // Start looking from the front
    const elevation = 0; // Start at same height as target

    // Calculate initial position using spherical coordinates
    const position: Vec3 = [
      target[0] + distance * Math.cos(elevation) * Math.sin(azimuth),
      target[1] + distance * Math.sin(elevation),
      target[2] + distance * Math.cos(elevation) * Math.cos(azimuth),
    ];

    // Add camera component
    camera.addComponent(
      world.createComponent(Camera3DComponent, {
        fov,
        aspectRatio,
        near: 0.1,
        far: 1000,
        projectionMode: 'perspective',
        cameraMode: 'custom',
        controlMode: 'orbit',
        target,
      }),
    );

    // Add transform component
    camera.addComponent(
      world.createComponent(Transform3DComponent, {
        position,
        rotation: [0, 0, 0],
      }),
    );

    // Add control component
    camera.addComponent(
      world.createComponent(CameraControlComponent, {
        mode: 'orbit',
        config: {
          orbit: {
            target,
            distance,
            minDistance: 1,
            maxDistance: 100,
            panSensitivity: 0.01,
            zoomSensitivity: 0.1,
            rotationSensitivity: 0.005,
            enablePan: true,
            enableZoom: true,
            enableRotation: true,
          },
        },
      }),
    );

    // Add input component
    camera.addComponent(world.createComponent(Input3DComponent, {}));

    // Mark as active camera
    camera.addComponent(world.createComponent(ActiveCameraTag, {}));

    return camera;
  }

  /**
   * Create a complete free camera entity
   */
  static createFreeCamera(
    world: World,
    position: Vec3 = [0, 0, 10],
    fov: number = 75,
    aspectRatio: number = 16 / 9,
  ): Entity {
    const camera = world.createEntity('camera');

    // Add camera component
    camera.addComponent(
      world.createComponent(Camera3DComponent, {
        fov,
        aspectRatio,
        near: 0.1,
        far: 1000,
        projectionMode: 'perspective',
        cameraMode: 'custom',
        controlMode: 'free',
      }),
    );

    // Add transform component
    camera.addComponent(
      world.createComponent(Transform3DComponent, {
        position,
        rotation: [0, 0, 0],
      }),
    );

    // Add control component
    camera.addComponent(
      world.createComponent(CameraControlComponent, {
        mode: 'free',
      }),
    );

    // Add input component
    camera.addComponent(world.createComponent(Input3DComponent, {}));

    // Mark as active camera
    camera.addComponent(world.createComponent(ActiveCameraTag, {}));

    return camera;
  }

  /**
   * Create a complete fixed camera entity
   */
  static createFixedCamera(
    world: World,
    position: Vec3 = [0, 0, 10],
    target: Vec3 = [0, 0, 0],
    fov: number = 75,
    aspectRatio: number = 16 / 9,
  ): Entity {
    const camera = world.createEntity('camera');

    // Add camera component
    camera.addComponent(
      world.createComponent(Camera3DComponent, {
        fov,
        aspectRatio,
        near: 0.1,
        far: 1000,
        projectionMode: 'perspective',
        cameraMode: 'custom',
        controlMode: 'fixed',
        target,
      }),
    );

    // Add transform component
    camera.addComponent(
      world.createComponent(Transform3DComponent, {
        position,
        rotation: [0, 0, 0],
      }),
    );

    // Add control component
    camera.addComponent(
      world.createComponent(CameraControlComponent, {
        mode: 'fixed',
      }),
    );

    // Mark as active camera
    camera.addComponent(world.createComponent(ActiveCameraTag, {}));

    return camera;
  }

  /**
   * Create a camera with physics support
   */
  static createFPSCameraWithPhysics(
    world: World,
    position: Vec3 = [0, 0, 10],
    fov: number = 75,
    aspectRatio: number = 16 / 9,
  ): Entity {
    const camera = this.createFPSCamera(world, position, fov, aspectRatio);

    // Add physics component
    camera.addComponent(
      world.createComponent(PhysicsComponent, {
        velocity: [0, 0, 0],
      }),
    );

    // Add stats component
    camera.addComponent(
      world.createComponent(StatsComponent, {
        moveSpeedMultiplier: 1,
      }),
    );

    return camera;
  }

  /**
   * Convert existing camera to different mode
   */
  static switchCameraMode(camera: Entity, mode: CameraControlMode, target?: Vec3): void {
    const cameraComp = camera.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const controlComp = camera.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );

    if (cameraComp) {
      cameraComp.setControlMode(mode);
    }

    if (controlComp) {
      controlComp.setMode(mode);
      if (target && mode === 'orbit') {
        const config = controlComp.getOrbitConfig();
        if (config) {
          config.target[0] = target[0];
          config.target[1] = target[1];
          config.target[2] = target[2];
        }
      }
    }
  }
}
