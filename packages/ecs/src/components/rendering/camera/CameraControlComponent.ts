import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';
import {
  CameraControlConfig,
  CameraControlConfigUpdate,
  CameraControlMode,
  CameraControlState,
  DEFAULT_CAMERA_CONTROLS,
  OrbitView,
} from './CameraControlTypes';

export interface CameraControlProps {
  mode?: CameraControlMode;
  config?: CameraControlConfigUpdate;
}

export class CameraControlComponent extends Component {
  static componentName = 'CameraControl';

  private config: CameraControlConfig;
  private state: CameraControlState;
  // The view `resetOrbitView` returns to: the one the stage set up, remembered on request
  private orbitHome?: OrbitView;

  constructor(props: CameraControlProps = {}) {
    super('CameraControl');

    const mode = props.mode ?? 'fps';
    this.config = this.mergeConfig(DEFAULT_CAMERA_CONTROLS[mode], props.config ?? {});
    this.state = this.createInitialState();
  }

  /**
   * Get the current control mode
   */
  getMode(): CameraControlMode {
    return this.config.mode;
  }

  /**
   * Set the control mode and reset state
   */
  setMode(mode: CameraControlMode): void {
    this.config.mode = mode;
    this.state = this.createInitialState();
  }

  /**
   * Get the current configuration
   */
  getConfig(): CameraControlConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: CameraControlConfigUpdate): void {
    this.config = this.mergeConfig(this.config, updates);
  }

  /**
   * Get the current control state
   */
  getState(): CameraControlState {
    return { ...this.state };
  }

  /**
   * Update control state
   */
  updateState(updates: Partial<CameraControlState>): void {
    this.state = { ...this.state, ...updates };
  }

  /**
   * Reset control state
   */
  resetState(): void {
    this.state = this.createInitialState();
  }

  /**
   * Check if mouse is currently down
   */
  isMouseDown(): boolean {
    return this.state.isMouseDown;
  }

  /**
   * Set mouse down state
   */
  setMouseDown(isDown: boolean, button: number = 0): void {
    this.state.isMouseDown = isDown;
    this.state.mouseButton = button;
  }

  /**
   * Update mouse position
   */
  updateMousePosition(x: number, y: number): void {
    this.state.lastMouseX = x;
    this.state.lastMouseY = y;
  }

  /**
   * Get mouse delta from last position
   */
  getMouseDelta(currentX: number, currentY: number): { deltaX: number; deltaY: number } {
    return {
      deltaX: currentX - this.state.lastMouseX,
      deltaY: currentY - this.state.lastMouseY,
    };
  }

  /**
   * Update mouse position and return delta
   */
  updateMouseDelta(currentX: number, currentY: number): { deltaX: number; deltaY: number } {
    const delta = this.getMouseDelta(currentX, currentY);
    this.updateMousePosition(currentX, currentY);
    return delta;
  }

  /**
   * Get FPS-specific state
   */
  getFPSState(): CameraControlState['fps'] {
    return this.state.fps;
  }

  /**
   * Update FPS state
   */
  updateFPSState(updates: Partial<CameraControlState['fps']>): void {
    if (!this.state.fps) {
      this.state.fps = { yaw: 0, pitch: 0, roll: 0 };
    }
    this.state.fps = { ...this.state.fps, ...updates };
  }

  /**
   * Get orbit-specific state
   */
  getOrbitState(): CameraControlState['orbit'] {
    return this.state.orbit;
  }

  /**
   * Set part of the orbit view immediately: the rendered view and its goal both take the
   * value, so a widget's edit is not smoothed. `target` lands in the orbit config, which is
   * where the look-at reads it.
   */
  updateOrbitState(updates: Partial<OrbitView>): void {
    const orbit = this.ensureOrbitState();
    if (updates.azimuth !== undefined) {
      orbit.azimuth = orbit.goalAzimuth = updates.azimuth;
    }
    if (updates.elevation !== undefined) {
      orbit.elevation = orbit.goalElevation = updates.elevation;
    }
    if (updates.distance !== undefined) {
      orbit.distance = orbit.goalDistance = updates.distance;
    }
    if (updates.target !== undefined) {
      this.writeTarget(updates.target);
      orbit.goalTarget = [updates.target[0], updates.target[1], updates.target[2]];
    }
  }

  /**
   * Set part of the orbit view as a goal the rendered view approaches over the config's
   * damping time: what presets, focusing and the input write.
   */
  setOrbitGoal(updates: Partial<OrbitView>): void {
    const orbit = this.ensureOrbitState();
    if (updates.azimuth !== undefined) orbit.goalAzimuth = updates.azimuth;
    if (updates.elevation !== undefined) orbit.goalElevation = updates.elevation;
    if (updates.distance !== undefined) orbit.goalDistance = updates.distance;
    if (updates.target !== undefined) {
      orbit.goalTarget = [updates.target[0], updates.target[1], updates.target[2]];
    }
  }

  /** The orbit view the goal describes (where the camera is heading, or already is). */
  getOrbitGoal(): OrbitView | undefined {
    const orbit = this.state.orbit;
    if (!orbit) return undefined;
    return {
      azimuth: orbit.goalAzimuth,
      elevation: orbit.goalElevation,
      distance: orbit.goalDistance,
      target: [orbit.goalTarget[0], orbit.goalTarget[1], orbit.goalTarget[2]],
    };
  }

  /** Remember the current goal (or `view`) as the view a reset returns to. */
  setOrbitHome(view?: OrbitView): void {
    const home = view ?? this.getOrbitGoal();
    if (home) {
      this.orbitHome = { ...home, target: [home.target[0], home.target[1], home.target[2]] };
    }
  }

  getOrbitHome(): OrbitView | undefined {
    return this.orbitHome;
  }

  private ensureOrbitState(): NonNullable<CameraControlState['orbit']> {
    if (!this.state.orbit) {
      const distance = this.config.orbit?.distance ?? 10;
      const target = this.config.orbit?.target ?? [0, 0, 0];
      this.state.orbit = {
        azimuth: 0,
        elevation: 0,
        distance,
        goalAzimuth: 0,
        goalElevation: 0,
        goalDistance: distance,
        goalTarget: [target[0], target[1], target[2]],
      };
    }
    return this.state.orbit;
  }

  // In place: the orbit system pans by mutating this array, and the camera panel reads it
  private writeTarget(target: Vec3): void {
    const orbit = this.config.orbit;
    if (!orbit) return;
    orbit.target[0] = target[0];
    orbit.target[1] = target[1];
    orbit.target[2] = target[2];
  }

  /**
   * Get FPS configuration
   */
  getFPSConfig() {
    return this.config.fps;
  }

  /**
   * Get orbit configuration
   */
  getOrbitConfig() {
    return this.config.orbit;
  }

  /**
   * Get free configuration
   */
  getFreeConfig() {
    return this.config.free;
  }

  /**
   * Check if orbit mode is enabled
   */
  isOrbitMode(): boolean {
    return this.config.mode === 'orbit';
  }

  /**
   * Check if FPS mode is enabled
   */
  isFPSMode(): boolean {
    return this.config.mode === 'fps';
  }

  /**
   * Check if free mode is enabled
   */
  isFreeMode(): boolean {
    return this.config.mode === 'free';
  }

  /**
   * Check if fixed mode is enabled
   */
  isFixedMode(): boolean {
    return this.config.mode === 'fixed';
  }

  /**
   * Create initial state based on current mode
   */
  private createInitialState(): CameraControlState {
    const baseState: CameraControlState = {
      isMouseDown: false,
      mouseButton: 0,
      lastMouseX: 0,
      lastMouseY: 0,
    };

    switch (this.config.mode) {
      case 'fps':
        return {
          ...baseState,
          fps: { yaw: 0, pitch: 0, roll: 0 },
        };

      case 'orbit': {
        const distance = this.config.orbit?.distance ?? 10;
        const target = this.config.orbit?.target ?? [0, 0, 0];
        return {
          ...baseState,
          orbit: {
            azimuth: 0,
            elevation: 0,
            distance,
            goalAzimuth: 0,
            goalElevation: 0,
            goalDistance: distance,
            goalTarget: [target[0], target[1], target[2]],
          },
        };
      }

      case 'free':
        return {
          ...baseState,
          fps: { yaw: 0, pitch: 0, roll: 0 },
        };

      case 'fixed':
      default:
        return baseState;
    }
  }

  /**
   * Deep merge camera control config with updates for nested control modes.
   * Only merges known nested keys for performance and clarity.
   */
  private mergeConfig(
    base: CameraControlConfig,
    updates: CameraControlConfigUpdate,
  ): CameraControlConfig {
    // Helper to merge nested config objects
    const mergeNested = <T extends object>(a?: T, b?: Partial<T>): T | undefined => {
      if (a && b) return { ...a, ...b };
      return (a as T) || (b as T) || undefined;
    };

    return {
      ...base,
      ...updates,
      fps: mergeNested(base.fps, updates.fps),
      orbit: mergeNested(base.orbit, updates.orbit),
      free: mergeNested(base.free, updates.free),
      fixed: mergeNested(base.fixed, updates.fixed),
    };
  }

  /**
   * Reset component to default state
   */
  reset(): void {
    super.reset();
    this.config = DEFAULT_CAMERA_CONTROLS.fps;
    this.state = this.createInitialState();
    this.orbitHome = undefined;
  }
}
