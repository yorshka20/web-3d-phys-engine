import { Component } from '@ecs/core/ecs/Component';

export interface Input3DState {
  // move control (WASD + Space/C)
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean; // Space - up/jump
  down: boolean; // C - down/crouch

  // mouse control
  mouseDeltaX: number;
  mouseDeltaY: number;
  mouseButtons: Set<number>;

  // other controls
  sprint: boolean; // Shift - sprint

  // mouse locked state
  isMouseLocked: boolean;
}

// a FPS style input component
export class Input3DComponent extends Component {
  static componentName = 'Input3D';

  private state: Input3DState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    mouseButtons: new Set(),
    sprint: false,
    isMouseLocked: false,
  };

  constructor() {
    super('Input3D');
  }

  getState(): Input3DState {
    return {
      ...this.state,
      mouseButtons: new Set(this.state.mouseButtons),
    };
  }

  setState(newState: Partial<Input3DState>): void {
    this.state = { ...this.state, ...newState };
    // console.log('Input3DComponent setState', JSON.stringify(this.state, null, 2));
  }

  isMoving(): boolean {
    return (
      this.state.forward ||
      this.state.backward ||
      this.state.left ||
      this.state.right ||
      this.state.up ||
      this.state.down
    );
  }

  getMoveDirection(): [number, number, number] {
    let right = 0,
      up = 0,
      forward = 0;

    if (this.state.forward) forward += 1;
    if (this.state.backward) forward -= 1;
    if (this.state.right) right += 1;
    if (this.state.left) right -= 1;
    if (this.state.up) up += 1;
    if (this.state.down) up -= 1;

    return [right, up, forward];
  }

  getMouseDelta(): [number, number] {
    return [this.state.mouseDeltaX, this.state.mouseDeltaY];
  }

  clearMouseDelta(): void {
    this.state.mouseDeltaX = 0;
    this.state.mouseDeltaY = 0;
  }

  getMoveSpeedMultiplier(): number {
    return this.state.sprint ? 2.0 : 1.0;
  }

  reset(): void {
    super.reset();
    this.state = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      mouseDeltaX: 0,
      mouseDeltaY: 0,
      mouseButtons: new Set(),
      sprint: false,
      isMouseLocked: false,
    };
  }
}
