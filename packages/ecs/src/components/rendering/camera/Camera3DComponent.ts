import { Component } from '@ecs/core/ecs/Component';
import { Resolution, Vec2, Vec3, ViewBounds } from '@ecs/types/types';
import { SerializedCamera, SerializedRay } from '@renderer/rayTracing/base/types';

export type ProjectionMode = 'perspective' | 'orthographic';
export type CameraMode = 'topdown' | 'sideview' | 'custom';

export interface Camera3DProps {
  fov?: number;
  facing?: number;
  height?: number;
  pitch?: number;
  projectionMode?: ProjectionMode;
  cameraMode?: CameraMode;
  resolution?: Resolution;
  viewBounds?: ViewBounds;
  isActive?: boolean;

  // Enhanced 3D properties for WebGPU compatibility
  aspectRatio?: number;
  near?: number;
  far?: number;
  target?: Vec3; // Look-at target for 3D camera
  up?: Vec3; // Up vector for 3D camera
}

export class Camera3DComponent extends Component {
  static componentName = 'Camera';

  fov = 90; // Field of view in degrees
  facing = 0; // Angle in degrees (yaw rotation)

  // 3d properties
  pitch = 0; // pitch angle (up and down)
  roll = 0; // roll angle (rarely used)

  // projection and rendering settings
  projectionMode: ProjectionMode = 'perspective';
  cameraMode: CameraMode = 'sideview';
  near = 0.1;
  far = 1000;

  // view bounds (for ray tracing sampling)
  viewBounds: ViewBounds = {
    left: -10,
    right: 10,
    top: 10,
    bottom: -10,
  };
  resolution: Resolution = { width: 800, height: 600 };

  // control properties
  isActive = true;
  zoom = 1.0;

  // Enhanced 3D properties for WebGPU compatibility
  aspectRatio: number = 16 / 9;
  target: Vec3 = [0, 0, 0];
  up: Vec3 = [0, 1, 0];

  constructor(props: Camera3DProps = {}) {
    super('Camera');

    // use provided values or defaults
    this.fov = props.fov ?? 90;
    this.facing = props.facing ?? 0;
    this.pitch = props.pitch ?? 0;
    this.projectionMode = props.projectionMode ?? 'perspective';
    this.cameraMode = props.cameraMode ?? 'sideview';
    this.resolution = props.resolution ?? { width: 800, height: 600 };
    this.viewBounds = props.viewBounds ?? {
      left: -10,
      right: 10,
      top: 10,
      bottom: -10,
    };
    this.isActive = props.isActive ?? true;
  }

  // Note: Position is now managed by Transform3DComponent
  // Use entity.getComponent(Transform3DComponent) to access position

  // get forward vector
  get forwardVector(): Vec3 {
    const yawRad = (this.facing * Math.PI) / 180;
    const pitchRad = (this.pitch * Math.PI) / 180;

    return [
      Math.cos(pitchRad) * Math.cos(yawRad),
      Math.cos(pitchRad) * Math.sin(yawRad),
      -Math.sin(pitchRad),
    ];
  }

  // quick set preset mode
  setTopDownMode(): void {
    this.cameraMode = 'topdown';
    this.pitch = -90; // look down
    this.projectionMode = 'orthographic';
  }

  setSideViewMode(): void {
    this.cameraMode = 'sideview';
    this.pitch = 0; // look horizontal
    this.projectionMode = 'perspective';
  }

  // calculate world coordinates based on view bounds
  screenToWorld(screenX: number, screenY: number): Vec2 {
    const normalizedX = screenX / this.resolution.width;
    const normalizedY = screenY / this.resolution.height;

    const worldX =
      this.viewBounds.left + (this.viewBounds.right - this.viewBounds.left) * normalizedX;
    const worldY =
      this.viewBounds.top + (this.viewBounds.bottom - this.viewBounds.top) * normalizedY;

    return [worldX, worldY];
  }

  /**
   * Generates a 3D ray from the camera's perspective for a given screen coordinate.
   * This function handles different camera modes (top-down, side-view, custom) and projection modes (orthographic, perspective).
   * @param screenX The X-coordinate on the screen (pixel).
   * @param screenY The Y-coordinate on the screen (pixel).
   * @param camera The serialized camera data containing its properties and settings.
   * @returns An object containing the ray's origin and direction in 3D world space.
   */
  static generateCameraRay(
    screenX: number,
    screenY: number,
    camera: SerializedCamera,
  ): SerializedRay {
    // Convert screen coordinates to normalized coordinates
    const normalizedX = screenX / camera.resolution.width;
    const normalizedY = screenY / camera.resolution.height;

    // Map to view bounds
    const worldX =
      camera.viewBounds.left + (camera.viewBounds.right - camera.viewBounds.left) * normalizedX;
    const worldY =
      camera.viewBounds.bottom + normalizedY * (camera.viewBounds.top - camera.viewBounds.bottom);

    const origin: Vec3 = [...camera.position]; // Create a copy to avoid modifying the component's position directly

    let direction: Vec3;

    if (camera.cameraMode === 'topdown') {
      // Top-down view: parallel rays pointing down
      direction = [0, 0, -1];

      // For orthographic projection in top-down, adjust the ray origin
      if (camera.projectionMode === 'orthographic') {
        origin[0] = worldX;
        origin[1] = worldY;
      }
    } else if (camera.cameraMode === 'sideview') {
      // Side view: rays from camera position to world points
      direction = [worldX - origin[0], worldY - origin[1], 0 - origin[2]]; // Assuming a target Z of 0 for sideview

      // Normalize direction
      const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
      if (length > 0) {
        direction[0] /= length;
        direction[1] /= length;
        direction[2] /= length;
      }
    } else {
      // Custom camera mode - implement perspective calculation
      const halfFov = (camera.fov / 2) * (Math.PI / 180);
      const aspectRatio = camera.aspectRatio;

      const screenNormalizedX = (normalizedX * 2 - 1) * aspectRatio;
      const screenNormalizedY = 1 - normalizedY * 2;

      // Create direction in camera space
      const cameraDirection: Vec3 = [
        screenNormalizedX * Math.tan(halfFov),
        screenNormalizedY * Math.tan(halfFov),
        -1,
      ];

      // Apply camera rotations (facing, pitch, roll)
      direction = Camera3DComponent.applyCameraRotations(cameraDirection, camera); // Pass Camera3DComponent directly
    }

    return { origin, direction };
  }

  /**
   * Applies camera rotations (pitch, facing, roll) to a given 3D direction vector.
   * This transforms a direction from camera space to world space.
   * @param direction The 3D direction vector in camera space.
   * @param camera The Camera3DComponent instance containing its rotation properties.
   * @returns The rotated 3D direction vector in world space.
   */
  static applyCameraRotations(direction: Vec3, camera: SerializedCamera): Vec3 {
    let result: Vec3 = [...direction];

    // Apply pitch (rotation around X-axis)
    if (camera.pitch !== 0) {
      const pitchRad = (camera.pitch * Math.PI) / 180;
      const cos = Math.cos(pitchRad);
      const sin = Math.sin(pitchRad);
      const y = result[1] * cos - result[2] * sin;
      const z = result[1] * sin + result[2] * cos;
      result[1] = y;
      result[2] = z;
    }

    // Apply facing (rotation around Z-axis, yaw)
    if (camera.facing !== 0) {
      const facingRad = (camera.facing * Math.PI) / 180;
      const cos = Math.cos(facingRad);
      const sin = Math.sin(facingRad);
      const x = result[0] * cos - result[1] * sin;
      const y = result[0] * sin + result[1] * cos;
      result[0] = x;
      result[1] = y;
    }

    // Apply roll (rotation around Y-axis) - rarely used
    if (camera.roll !== 0) {
      const rollRad = (camera.roll * Math.PI) / 180;
      const cos = Math.cos(rollRad);
      const sin = Math.sin(rollRad);
      const x = result[0] * cos + result[2] * sin;
      const z = -result[0] * sin + result[2] * cos;
      result[0] = x;
      result[2] = z;
    }

    // Normalize the result
    const length = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2);
    if (length > 0) {
      result[0] /= length;
      result[1] /= length;
      result[2] /= length;
    }

    return result;
  }

  // update view bounds (based on camera position and zoom)
  // Note: position parameter should be passed from Transform3DComponent
  updateViewBounds(position: Vec3): void {
    const halfWidth = ((this.viewBounds.right - this.viewBounds.left) / 2) * this.zoom;
    const halfHeight = ((this.viewBounds.top - this.viewBounds.bottom) / 2) * this.zoom;

    this.viewBounds = {
      left: position[0] - halfWidth,
      right: position[0] + halfWidth,
      top: position[1] + halfHeight,
      bottom: position[1] - halfHeight,
    };
  }

  // Enhanced 3D methods for WebGPU compatibility

  /**
   * Get the aspect ratio for 3D rendering
   */
  getAspectRatio(): number {
    return this.aspectRatio;
  }

  /**
   * Set the aspect ratio for 3D rendering
   */
  setAspectRatio(aspectRatio: number): void {
    this.aspectRatio = aspectRatio;
  }

  /**
   * Get the look-at target for 3D camera
   */
  getTarget(): Vec3 {
    return this.target;
  }

  /**
   * Set the look-at target for 3D camera
   */
  setTarget(target: Vec3): void {
    this.target = target;
  }

  /**
   * Get the up vector for 3D camera
   */
  getUp(): Vec3 {
    return this.up;
  }

  /**
   * Set the up vector for 3D camera
   */
  setUp(up: Vec3): void {
    this.up = up;
  }

  /**
   * Get projection matrix for WebGPU rendering
   * This would be calculated by the rendering system
   */
  getProjectionMatrix(): Float32Array {
    // Placeholder - should be calculated by rendering system
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  /**
   * Get view matrix for WebGPU rendering
   * This would be calculated by the rendering system
   */
  getViewMatrix(): Float32Array {
    // Placeholder - should be calculated by rendering system
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  /**
   * Get view projection matrix for WebGPU rendering
   * This would be calculated by multiplying projection and view matrices.
   */
  getViewProjectionMatrix(): Float32Array {
    // Placeholder - should be calculated by rendering system
    const viewMatrix = this.getViewMatrix();
    const projectionMatrix = this.getProjectionMatrix();
    // For now, return an identity matrix. Actual multiplication will be done in the renderer.
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  /**
   * Set camera to look at a specific target
   */
  lookAt(target: Vec3, up: Vec3 = [0, 1, 0]): void {
    this.target = target;
    this.up = up;
  }

  /**
   * Move camera by a given offset
   * Note: This should be handled by Transform3DComponent
   * @deprecated Use Transform3DComponent.move() instead
   */
  moveBy(offset: Vec3): void {
    console.warn(
      'Camera3DComponent.moveBy() is deprecated. Use Transform3DComponent.move() instead.',
    );
  }

  /**
   * Rotate camera around a target point.
   * This is a simplified placeholder. Actual rotation would involve matrix operations.
   */
  rotateAround(target: Vec3, axis: Vec3, angle: number): void {
    // Placeholder implementation - actual rotation would use a math library
    // For now, we'll just log a message.
    console.log(`Rotating camera around target ${target} by angle ${angle} along axis ${axis}`);
  }

  /**
   * Create a perspective camera configuration
   */
  setPerspective(fov: number, aspectRatio: number, near: number, far: number): void {
    this.fov = fov;
    this.aspectRatio = aspectRatio;
    this.near = near;
    this.far = far;
    this.projectionMode = 'perspective';
  }

  /**
   * Create an orthographic camera configuration
   */
  setOrthographic(
    left: number,
    right: number,
    top: number,
    bottom: number,
    near: number,
    far: number,
  ): void {
    this.projectionMode = 'orthographic';
    this.near = near;
    this.far = far;
    // Store orthographic bounds in viewBounds for compatibility
    this.viewBounds = { left, right, top, bottom };
  }

  // Convenient creation methods for 3D rendering
  static createPerspectiveCamera(
    fov: number = 75,
    aspectRatio: number = 16 / 9,
  ): Camera3DComponent {
    return new Camera3DComponent({
      fov,
      aspectRatio,
      projectionMode: 'perspective',
      cameraMode: 'custom',
    });
  }

  static createOrthographicCamera(
    left: number = -1,
    right: number = 1,
    top: number = 1,
    bottom: number = -1,
  ): Camera3DComponent {
    return new Camera3DComponent({
      projectionMode: 'orthographic',
      cameraMode: 'custom',
      viewBounds: { left, right, top, bottom },
    });
  }

  static createMainCamera(): Camera3DComponent {
    return new Camera3DComponent({
      fov: 75,
      aspectRatio: 16 / 9,
      projectionMode: 'perspective',
      cameraMode: 'custom',
      isActive: true,
    });
  }
}
