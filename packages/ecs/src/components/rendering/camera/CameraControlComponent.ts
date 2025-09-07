import { Component } from '@ecs/core/ecs/Component';
import {
  CameraControlConfig,
  CameraControlMode,
  CameraControlState,
  DEFAULT_CAMERA_CONTROLS,
} from './CameraControlTypes';

export interface CameraControlProps {
  mode?: CameraControlMode;
  config?: Partial<CameraControlConfig>;
}

export class CameraControlComponent extends Component {
  static componentName = 'CameraControl';

  private config: CameraControlConfig;
  private state: CameraControlState;

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
  updateConfig(updates: Partial<CameraControlConfig>): void {
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
   * Update orbit state
   */
  updateOrbitState(updates: Partial<CameraControlState['orbit']>): void {
    if (!this.state.orbit) {
      this.state.orbit = { azimuth: 0, elevation: 0, distance: 10 };
    }
    this.state.orbit = { ...this.state.orbit, ...updates };
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

      case 'orbit':
        return {
          ...baseState,
          orbit: {
            azimuth: 0,
            elevation: 0,
            distance: this.config.orbit?.distance ?? 10,
          },
        };

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
    updates: Partial<CameraControlConfig>,
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
  }
}
