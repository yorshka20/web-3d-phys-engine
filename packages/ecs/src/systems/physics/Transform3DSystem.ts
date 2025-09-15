import {
  ActiveCameraTag,
  Camera3DComponent,
  CameraControlComponent,
  Input3DComponent,
  Input3DState,
  PhysicsComponent,
  StatsComponent,
  Transform3DComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Vec3 } from '@ecs/types/types';

interface Transform3DData {
  targetPosition?: Vec3;
  positionSpeed?: number; // units per second
  targetRotation?: Vec3;
  rotationSpeed?: number; // radians per second
  targetScale?: Vec3;
  scaleSpeed?: number; // scale units per second
}

export class Transform3DSystem extends System {
  private SMALL_VELOCITY_THRESHOLD: number = 1e-3;

  // Map to store transform data for entities
  private transformData: Map<string, Transform3DData> = new Map();

  // Camera-specific properties
  private cameraYaw: number = 0; // Horizontal rotation (around Y axis)
  private cameraPitch: number = 0; // Vertical rotation (around X axis)
  private cameraRoll: number = 0; // Roll rotation (around Z axis)

  constructor() {
    super('Transform3DSystem', SystemPriorities.TRANSFORM, 'render');
  }

  update(deltaTime: number): void {
    // Handle movement for entities with 3D input
    this.handle3DInputMovement(deltaTime);

    // Handle camera-specific transformations
    this.handleCameraTransformations(deltaTime);

    // Handle all entities with Transform3DComponent for animations
    this.handleTransformAnimations(deltaTime);
  }

  /**
   * Handle 3D movement for entities with Input3DComponent
   */
  private handle3DInputMovement(deltaTime: number): void {
    const inputEntities = this.world.getEntitiesWithComponents([
      Transform3DComponent,
      Input3DComponent,
    ]);

    for (const entity of inputEntities) {
      const transform = entity.getComponent<Transform3DComponent>(
        Transform3DComponent.componentName,
      );
      const input = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const stats = entity.getComponent<StatsComponent>(StatsComponent.componentName);

      if (!transform || !input) continue;

      const state = input.getState();

      // Handle camera rotation from mouse input
      if (entity.hasComponent(Camera3DComponent.componentName)) {
        this.handleCameraRotation(entity, state, deltaTime);
      }

      // Handle movement
      if (physics) {
        this.handleVelocityMovement3D(state, physics, input, deltaTime);
      } else {
        this.handleDirectMovement3D(state, transform, stats, deltaTime);
      }
    }
  }

  /**
   * Handle camera-specific transformations
   */
  private handleCameraTransformations(deltaTime: number): void {
    const cameraEntities = this.world.getEntitiesWithComponents([
      Transform3DComponent,
      Camera3DComponent,
      ActiveCameraTag,
    ]);

    for (const entity of cameraEntities) {
      const transform = entity.getComponent<Transform3DComponent>(
        Transform3DComponent.componentName,
      );
      const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
      const control = entity.getComponent<CameraControlComponent>(
        CameraControlComponent.componentName,
      );

      if (!transform || !camera) continue;

      // Handle different camera control modes
      if (control) {
        switch (control.getMode()) {
          case 'fps':
            this.handleFPSCameraTransform(entity, transform, camera, deltaTime);
            break;
          case 'orbit':
            // Orbit camera is handled by OrbitCameraControlSystem
            break;
          case 'free':
            this.handleFreeCameraTransform(entity, transform, camera, deltaTime);
            break;
          case 'fixed':
            // Fixed camera doesn't need transformation updates
            break;
        }
      } else {
        // Fallback to legacy FPS behavior for backward compatibility
        this.handleLegacyFPSCameraTransform(transform, camera);
      }
    }
  }

  /**
   * Handle FPS camera transformations
   */
  private handleFPSCameraTransform(
    entity: Entity,
    transform: Transform3DComponent,
    camera: Camera3DComponent,
    deltaTime: number,
  ): void {
    // Update camera component with current rotation
    camera.facing = (this.cameraYaw * 180) / Math.PI; // Convert to degrees
    camera.pitch = (this.cameraPitch * 180) / Math.PI; // Convert to degrees
    camera.roll = (this.cameraRoll * 180) / Math.PI; // Convert to degrees

    // Update transform rotation to match camera rotation
    transform.setRotation([this.cameraPitch, this.cameraYaw, this.cameraRoll]);

    // Calculate and update camera target based on rotation
    const position = transform.getPosition();
    const forward = this.getCameraForwardVector();

    // Calculate target position (camera position + forward direction)
    const target: Vec3 = [
      position[0] + forward[0],
      position[1] + forward[1],
      position[2] + forward[2],
    ];

    camera.setTarget(target);
  }

  /**
   * Handle free camera transformations
   */
  private handleFreeCameraTransform(
    entity: Entity,
    transform: Transform3DComponent,
    camera: Camera3DComponent,
    deltaTime: number,
  ): void {
    // Similar to FPS but with different constraints
    camera.facing = (this.cameraYaw * 180) / Math.PI;
    camera.pitch = (this.cameraPitch * 180) / Math.PI;
    camera.roll = (this.cameraRoll * 180) / Math.PI;

    transform.setRotation([this.cameraPitch, this.cameraYaw, this.cameraRoll]);

    const position = transform.getPosition();
    const forward = this.getCameraForwardVector();

    const target: Vec3 = [
      position[0] + forward[0],
      position[1] + forward[1],
      position[2] + forward[2],
    ];

    camera.setTarget(target);
  }

  /**
   * Handle legacy FPS camera transformations (for backward compatibility)
   */
  private handleLegacyFPSCameraTransform(
    transform: Transform3DComponent,
    camera: Camera3DComponent,
  ): void {
    // Update camera component with current rotation
    camera.facing = (this.cameraYaw * 180) / Math.PI; // Convert to degrees
    camera.pitch = (this.cameraPitch * 180) / Math.PI; // Convert to degrees
    camera.roll = (this.cameraRoll * 180) / Math.PI; // Convert to degrees

    // Update transform rotation to match camera rotation
    transform.setRotation([this.cameraPitch, this.cameraYaw, this.cameraRoll]);

    // Calculate and update camera target based on rotation
    const position = transform.getPosition();
    const forward = this.getCameraForwardVector();

    // Calculate target position (camera position + forward direction)
    const target: Vec3 = [
      position[0] + forward[0],
      position[1] + forward[1],
      position[2] + forward[2],
    ];

    camera.setTarget(target);
  }

  /**
   * Handle camera rotation from mouse input
   */
  private handleCameraRotation(entity: Entity, state: Input3DState, deltaTime: number): void {
    const input = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);
    const control = entity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );
    if (!input) return;

    const [mouseDeltaX, mouseDeltaY] = input.getMouseDelta();

    // Handle different control modes
    if (control) {
      switch (control.getMode()) {
        case 'fps':
          this.handleFPSRotation(control, input, mouseDeltaX, mouseDeltaY);
          break;
        case 'orbit':
          // Orbit rotation is handled by OrbitCameraControlSystem
          break;
        case 'free':
          this.handleFreeRotation(control, input, mouseDeltaX, mouseDeltaY);
          break;
        case 'fixed':
          // Fixed camera doesn't respond to mouse input
          break;
      }
    } else {
      // Legacy FPS behavior for backward compatibility
      this.handleLegacyFPSRotation(input, mouseDeltaX, mouseDeltaY);
    }
  }

  /**
   * Handle FPS camera rotation
   */
  private handleFPSRotation(
    control: CameraControlComponent,
    input: Input3DComponent,
    mouseDeltaX: number,
    mouseDeltaY: number,
  ): void {
    const config = control.getFPSConfig();
    if (!config) return;

    const sensitivity = config.mouseSensitivity;
    const invertY = config.invertY ? -1 : 1;

    this.cameraYaw -= mouseDeltaX * sensitivity;
    this.cameraPitch += mouseDeltaY * sensitivity * invertY;

    // Apply pitch clamping
    this.cameraPitch = Math.max(
      config.pitchClamp.min,
      Math.min(config.pitchClamp.max, this.cameraPitch),
    );

    // Clamp yaw to prevent 360-degree rotation
    const maxYaw = Math.PI;
    this.cameraYaw = Math.max(-maxYaw, Math.min(maxYaw, this.cameraYaw));

    input.clearMouseDelta();
  }

  /**
   * Handle free camera rotation
   */
  private handleFreeRotation(
    control: CameraControlComponent,
    input: Input3DComponent,
    mouseDeltaX: number,
    mouseDeltaY: number,
  ): void {
    const config = control.getFreeConfig();
    if (!config) return;

    const sensitivity = config.mouseSensitivity;

    this.cameraYaw -= mouseDeltaX * sensitivity;
    this.cameraPitch += mouseDeltaY * sensitivity;

    // No pitch clamping for free camera
    input.clearMouseDelta();
  }

  /**
   * Handle legacy FPS rotation (for backward compatibility)
   */
  private handleLegacyFPSRotation(
    input: Input3DComponent,
    mouseDeltaX: number,
    mouseDeltaY: number,
  ): void {
    // Apply mouse sensitivity
    const sensitivity = 0.002; // Adjust as needed
    this.cameraYaw -= mouseDeltaX * sensitivity;
    this.cameraPitch += mouseDeltaY * sensitivity;

    // Clamp yaw to prevent 360-degree rotation (limit to ±180 degrees)
    const maxYaw = Math.PI; // 180 degrees
    this.cameraYaw = Math.max(-maxYaw, Math.min(maxYaw, this.cameraYaw));

    // Clamp pitch to prevent over-rotation (limit to ±85 degrees for better FPS feel)
    const maxPitch = Math.PI / 2 - 0.087; // 85 degrees (slightly less than 90 degrees)
    this.cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, this.cameraPitch));

    // Clear mouse delta after processing
    input.clearMouseDelta();
  }

  /**
   * Handle 3D velocity-based movement
   */
  private handleVelocityMovement3D(
    state: Input3DState,
    physics: PhysicsComponent,
    input: Input3DComponent,
    deltaTime: number,
  ): void {
    const speed = physics.getSpeed() * (input.getMoveSpeedMultiplier() ?? 1);
    const moveDirection = this.getMoveDirectionFromState(state);

    // Apply camera-relative movement
    const [right, up, forward] = this.getCameraRelativeDirections();

    const velocity: Vec3 = [0, 0, 0];

    // Calculate movement in camera space
    velocity[0] = right[0] * moveDirection[0] + forward[0] * moveDirection[2];
    velocity[1] = up[1] * moveDirection[1];
    velocity[2] = right[2] * moveDirection[0] + forward[2] * moveDirection[2];

    // Apply speed
    velocity[0] *= speed;
    velocity[1] *= speed;
    velocity[2] *= speed;

    // Check if velocity is significant
    const magnitude = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
    if (magnitude < this.SMALL_VELOCITY_THRESHOLD) {
      physics.stop();
    } else {
      // Normalize and apply speed
      velocity[0] = (velocity[0] / magnitude) * speed;
      velocity[1] = (velocity[1] / magnitude) * speed;
      velocity[2] = (velocity[2] / magnitude) * speed;

      physics.setVelocity(velocity);
    }
  }

  /**
   * Handle direct 3D movement (without physics)
   */
  private handleDirectMovement3D(
    state: Input3DState,
    transform: Transform3DComponent,
    stats: StatsComponent | undefined,
    deltaTime: number,
  ): void {
    const speed = 5.0 * (stats?.moveSpeedMultiplier ?? 1); // Default speed
    const moveDirection = this.getMoveDirectionFromState(state);

    // Apply camera-relative movement
    const [right, up, forward] = this.getCameraRelativeDirections();

    const movement: Vec3 = [0, 0, 0];

    // Calculate movement in camera space
    movement[0] = right[0] * moveDirection[0] + forward[0] * moveDirection[2];
    movement[1] = up[1] * moveDirection[1];
    movement[2] = right[2] * moveDirection[0] + forward[2] * moveDirection[2];

    // Apply speed and deltaTime
    movement[0] *= speed * deltaTime;
    movement[1] *= speed * deltaTime;
    movement[2] *= speed * deltaTime;

    // Apply movement
    transform.move(movement[0], movement[1], movement[2]);
  }

  /**
   * Get movement direction from input state
   */
  private getMoveDirectionFromState(state: Input3DState): Vec3 {
    let right = 0,
      up = 0,
      forward = 0;

    if (state.forward) forward += 1;
    if (state.backward) forward -= 1;
    if (state.right) right += 1;
    if (state.left) right -= 1;
    if (state.up) up += 1;
    if (state.down) up -= 1;

    return [right, up, forward];
  }

  /**
   * Get camera-relative direction vectors
   */
  private getCameraRelativeDirections(): [Vec3, Vec3, Vec3] {
    // Forward vector (camera's look direction)
    const forward: Vec3 = [
      Math.cos(this.cameraPitch) * Math.sin(this.cameraYaw),
      -Math.sin(this.cameraPitch),
      Math.cos(this.cameraPitch) * Math.cos(this.cameraYaw),
    ];

    // Right vector (perpendicular to forward and up)
    const up: Vec3 = [0, 1, 0];
    const right: Vec3 = [
      Math.sin(this.cameraYaw - Math.PI / 2),
      0,
      Math.cos(this.cameraYaw - Math.PI / 2),
    ];

    return [right, up, forward];
  }

  /**
   * Handle transform animations (position, rotation, scale)
   */
  private handleTransformAnimations(deltaTime: number): void {
    const transformEntities = this.world.getEntitiesWithComponents([Transform3DComponent]);

    for (const entity of transformEntities) {
      const transform = entity.getComponent<Transform3DComponent>(
        Transform3DComponent.componentName,
      );
      if (!transform) continue;

      // Handle rotation velocity
      this.handleRotationVelocity(transform, deltaTime);

      this.handleTransformations(entity.id, transform, deltaTime);
    }
  }

  /**
   * Handle rotation velocity for entities
   */
  private handleRotationVelocity(transform: Transform3DComponent, deltaTime: number): void {
    const rotationVelocity = transform.getRotationVelocity();

    // Check if there's any rotation velocity
    const magnitude = Math.sqrt(
      rotationVelocity[0] ** 2 + rotationVelocity[1] ** 2 + rotationVelocity[2] ** 2,
    );

    if (magnitude > this.SMALL_VELOCITY_THRESHOLD) {
      // Apply rotation velocity to current rotation
      const deltaRotation: Vec3 = [
        rotationVelocity[0] * deltaTime,
        rotationVelocity[1] * deltaTime,
        rotationVelocity[2] * deltaTime,
      ];

      transform.rotate(deltaRotation[0], deltaRotation[1], deltaRotation[2]);
    }
  }

  /**
   * Handle individual entity transformations
   */
  private handleTransformations(
    entityId: string,
    transform: Transform3DComponent,
    deltaTime: number,
  ): void {
    const data = this.transformData.get(entityId);
    if (!data) return;

    // Handle position animation
    if (data.targetPosition && data.positionSpeed !== undefined) {
      const currentPosition = transform.getPosition();
      const targetPosition = data.targetPosition;
      const positionSpeed = data.positionSpeed * deltaTime;

      const dx = targetPosition[0] - currentPosition[0];
      const dy = targetPosition[1] - currentPosition[1];
      const dz = targetPosition[2] - currentPosition[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance <= positionSpeed) {
        transform.setPosition(targetPosition);
        // Clear target when reached
        const { targetPosition: _, positionSpeed: __, ...rest } = data;
        this.transformData.set(entityId, rest);
      } else {
        const direction = [dx / distance, dy / distance, dz / distance];
        transform.move(
          direction[0] * positionSpeed,
          direction[1] * positionSpeed,
          direction[2] * positionSpeed,
        );
      }
    }

    // Handle rotation animation
    if (data.targetRotation && data.rotationSpeed !== undefined) {
      const currentRotation = transform.getRotation();
      const targetRotation = data.targetRotation;
      const rotationSpeed = data.rotationSpeed * deltaTime;

      const rotationDiff: Vec3 = [
        targetRotation[0] - currentRotation[0],
        targetRotation[1] - currentRotation[1],
        targetRotation[2] - currentRotation[2],
      ];

      // Normalize rotation differences
      for (let i = 0; i < 3; i++) {
        while (rotationDiff[i] > Math.PI) rotationDiff[i] -= 2 * Math.PI;
        while (rotationDiff[i] < -Math.PI) rotationDiff[i] += 2 * Math.PI;
      }

      const totalDiff = Math.sqrt(
        rotationDiff[0] ** 2 + rotationDiff[1] ** 2 + rotationDiff[2] ** 2,
      );

      if (totalDiff <= rotationSpeed) {
        transform.setRotation(targetRotation);
        // Clear target when reached
        const { targetRotation: _, rotationSpeed: __, ...rest } = data;
        this.transformData.set(entityId, rest);
      } else {
        const direction = [
          rotationDiff[0] / totalDiff,
          rotationDiff[1] / totalDiff,
          rotationDiff[2] / totalDiff,
        ];
        transform.rotate(
          direction[0] * rotationSpeed,
          direction[1] * rotationSpeed,
          direction[2] * rotationSpeed,
        );
      }
    }

    // Handle scale animation
    if (data.targetScale && data.scaleSpeed !== undefined) {
      const currentScale = transform.getScale();
      const targetScale = data.targetScale;
      const scaleSpeed = data.scaleSpeed * deltaTime;

      const scaleDiff: Vec3 = [
        targetScale[0] - currentScale[0],
        targetScale[1] - currentScale[1],
        targetScale[2] - currentScale[2],
      ];

      const totalDiff = Math.sqrt(scaleDiff[0] ** 2 + scaleDiff[1] ** 2 + scaleDiff[2] ** 2);

      if (totalDiff <= scaleSpeed) {
        transform.setScale(targetScale);
        // Clear target when reached
        const { targetScale: _, scaleSpeed: __, ...rest } = data;
        this.transformData.set(entityId, rest);
      } else {
        const direction = [
          scaleDiff[0] / totalDiff,
          scaleDiff[1] / totalDiff,
          scaleDiff[2] / totalDiff,
        ];
        const newScale: Vec3 = [
          currentScale[0] + direction[0] * scaleSpeed,
          currentScale[1] + direction[1] * scaleSpeed,
          currentScale[2] + direction[2] * scaleSpeed,
        ];
        transform.setScale(newScale);
      }
    }

    // Clean up if no more transformations are needed
    if (Object.keys(this.transformData.get(entityId) || {}).length === 0) {
      this.transformData.delete(entityId);
    }
  }

  // Public methods to set transform targets

  /**
   * Set position animation target
   */
  setPositionTarget(entityId: string, targetPosition: Vec3, positionSpeed: number): void {
    const data = this.transformData.get(entityId) || {};
    this.transformData.set(entityId, {
      ...data,
      targetPosition,
      positionSpeed,
    });
  }

  /**
   * Set rotation animation target
   */
  setRotationTarget(entityId: string, targetRotation: Vec3, rotationSpeed: number): void {
    const data = this.transformData.get(entityId) || {};
    this.transformData.set(entityId, {
      ...data,
      targetRotation,
      rotationSpeed,
    });
  }

  /**
   * Set scale animation target
   */
  setScaleTarget(entityId: string, targetScale: Vec3, scaleSpeed: number): void {
    const data = this.transformData.get(entityId) || {};
    this.transformData.set(entityId, {
      ...data,
      targetScale,
      scaleSpeed,
    });
  }

  /**
   * Get current camera rotation
   */
  getCameraRotation(): { yaw: number; pitch: number; roll: number } {
    return {
      yaw: this.cameraYaw,
      pitch: this.cameraPitch,
      roll: this.cameraRoll,
    };
  }

  /**
   * Set camera rotation
   */
  setCameraRotation(yaw: number, pitch: number, roll: number = 0): void {
    this.cameraYaw = yaw;
    this.cameraPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
    this.cameraRoll = roll;
  }

  /**
   * Get camera forward vector based on current rotation
   */
  private getCameraForwardVector(): Vec3 {
    // Calculate forward vector from yaw and pitch
    const forward: Vec3 = [
      Math.cos(this.cameraPitch) * Math.sin(this.cameraYaw),
      -Math.sin(this.cameraPitch),
      Math.cos(this.cameraPitch) * Math.cos(this.cameraYaw),
    ];
    return forward;
  }
}
