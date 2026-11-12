import { Vec3 } from '@ecs/types/types';

/**
 * Camera control modes for different interaction styles
 */
export type CameraControlMode = 'fps' | 'orbit' | 'free' | 'fixed';

/**
 * Camera control configuration interface
 */
export interface CameraControlConfig {
  mode: CameraControlMode;

  // FPS mode settings
  fps?: {
    mouseSensitivity: number;
    invertY: boolean;
    pitchClamp: {
      min: number; // in radians
      max: number; // in radians
    };
  };

  // Orbit mode settings
  orbit?: {
    target: Vec3; // Point to orbit around
    distance: number; // Distance from target
    minDistance: number;
    maxDistance: number;
    panSensitivity: number; // Mouse pan sensitivity
    zoomSensitivity: number; // Mouse wheel zoom sensitivity
    rotationSensitivity: number; // Mouse rotation sensitivity
    moveSpeed: number; // WASD keyboard movement speed
    enablePan: boolean; // Allow panning with right mouse button
    enableZoom: boolean; // Allow zooming with mouse wheel
    enableRotation: boolean; // Allow rotation with left mouse button
    // Time constant, in seconds, of the exponential approach from the rendered view to the
    // goal the input writes (0 = the view is the goal, no smoothing)
    damping: number;
    // Wheel zoom dollies toward the point under the cursor on the target's plane instead of
    // toward the target itself
    zoomToCursor: boolean;
  };

  // Free mode settings (unrestricted movement)
  free?: {
    mouseSensitivity: number;
    moveSpeed: number;
    rotationSpeed: number;
  };

  // Fixed mode settings (no user control)
  fixed?: {
    // No additional settings needed
  };
}

/**
 * Camera control state interface
 */
export interface CameraControlState {
  // Mouse state
  isMouseDown: boolean;
  mouseButton: number; // 0 = left, 1 = right, 2 = middle
  lastMouseX: number;
  lastMouseY: number;

  // Orbit mode specific state. The rendered view (azimuth/elevation/distance and the config's
  // target) approaches the goal every tick; input and the view API write the goal, which is
  // what gives drags their damping and preset changes their transition.
  orbit?: {
    azimuth: number; // Horizontal angle around target
    elevation: number; // Vertical angle around target
    distance: number; // Current distance from target
    goalAzimuth: number;
    goalElevation: number;
    goalDistance: number;
    goalTarget: Vec3;
  };

  // FPS mode specific state
  fps?: {
    yaw: number; // Horizontal rotation
    pitch: number; // Vertical rotation
    roll: number; // Roll rotation
  };
}

/**
 * A config update: each mode's block may be given in part, the rest keeps its value.
 */
export type CameraControlConfigUpdate = {
  [K in keyof CameraControlConfig]?: NonNullable<CameraControlConfig[K]> extends object
    ? Partial<NonNullable<CameraControlConfig[K]>>
    : CameraControlConfig[K];
};

/**
 * One orbit view, as the view API reads and writes it: a partial leaves the rest of the view
 * where it is.
 */
export interface OrbitView {
  azimuth: number;
  elevation: number;
  distance: number;
  target: Vec3;
}

/**
 * Default camera control configurations
 */
export const DEFAULT_CAMERA_CONTROLS: Record<CameraControlMode, CameraControlConfig> = {
  fps: {
    mode: 'fps',
    fps: {
      mouseSensitivity: 0.002,
      invertY: false,
      pitchClamp: {
        min: -Math.PI / 2 + 0.1, // -85 degrees
        max: Math.PI / 2 - 0.1, // +85 degrees
      },
    },
  },

  orbit: {
    mode: 'orbit',
    orbit: {
      target: [0, 0, 0], // Default target point (can be changed via setOrbitTarget)
      distance: 10,
      minDistance: 1,
      maxDistance: 100,
      panSensitivity: 0.01,
      zoomSensitivity: 0.002,
      rotationSensitivity: 0.005,
      moveSpeed: 5.0,
      enablePan: true,
      enableZoom: true,
      enableRotation: true,
      damping: 0.12,
      zoomToCursor: true,
    },
  },

  free: {
    mode: 'free',
    free: {
      mouseSensitivity: 0.002,
      moveSpeed: 5.0,
      rotationSpeed: 2.0,
    },
  },

  fixed: {
    mode: 'fixed',
  },
};
