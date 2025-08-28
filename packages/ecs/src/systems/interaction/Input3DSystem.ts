import { Input3DComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';

const KEY_MAP_3D = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'up',
  KeyC: 'down',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
} as const;

type KeyMap3D = typeof KEY_MAP_3D;
type Action3D = KeyMap3D[keyof KeyMap3D];

export class Input3DSystem extends System {
  private keyState: Record<Action3D, boolean> = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    sprint: false,
  };

  private inputEntities: Set<Entity> = new Set();
  private rootElement: HTMLElement;

  // mouse state
  private mouseButtons: Set<number> = new Set();
  private isPointerLocked: boolean = false;

  constructor(rootElement: HTMLElement) {
    super('Input3DSystem', SystemPriorities.INPUT, 'logic');
    this.rootElement = rootElement;
  }

  init(): void {
    // keyboard events
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // mouse events
    this.rootElement.addEventListener('click', this.handleCanvasClick);
    this.rootElement.addEventListener('mousemove', this.handleMouseMove);
    this.rootElement.addEventListener('mousedown', this.handleMouseDown);
    this.rootElement.addEventListener('mouseup', this.handleMouseUp);

    // pointer lock events
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);

    // initialize input entities
    this.updateInputEntities();

    // subscribe to entity change events
    this.world.onEntityAdded.subscribe(this.handleEntityAdded);
    this.world.onEntityRemoved.subscribe(this.handleEntityRemoved);
  }

  destroy(): void {
    // remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    this.rootElement.removeEventListener('click', this.handleCanvasClick);
    this.rootElement.removeEventListener('mousemove', this.handleMouseMove);
    this.rootElement.removeEventListener('mousedown', this.handleMouseDown);
    this.rootElement.removeEventListener('mouseup', this.handleMouseUp);

    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);

    // unsubscribe
    this.world.onEntityAdded.unsubscribe(this.handleEntityAdded);
    this.world.onEntityRemoved.unsubscribe(this.handleEntityRemoved);

    this.inputEntities.clear();
  }

  private handleEntityAdded = (entity: Entity) => {
    if (entity.hasComponent(Input3DComponent.componentName)) {
      this.inputEntities.add(entity);
    }
  };

  private handleEntityRemoved = (entity: Entity) => {
    this.inputEntities.delete(entity);
  };

  private updateInputEntities(): void {
    this.inputEntities.clear();
    const entities = this.world.getEntitiesByCondition((entity) =>
      entity.hasComponent(Input3DComponent.componentName),
    );
    for (const entity of entities) {
      this.inputEntities.add(entity);
    }
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    const action = KEY_MAP_3D[event.code as keyof KeyMap3D];
    if (action) {
      this.keyState[action] = true;
      this.updateKeyboardState();
      event.preventDefault();
    }

    // ESC exit pointer lock
    if (event.code === 'Escape' && this.isPointerLocked) {
      document.exitPointerLock();
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    const action = KEY_MAP_3D[event.code as keyof KeyMap3D];
    if (action) {
      this.keyState[action] = false;
      this.updateKeyboardState();
      event.preventDefault();
    }
  };

  private handleCanvasClick = () => {
    if (!this.isPointerLocked) {
      this.rootElement.requestPointerLock();
    }
  };

  private handleMouseMove = (event: MouseEvent) => {
    if (this.isPointerLocked) {
      this.updateMouseDelta(event.movementX, event.movementY);
    }
  };

  private handleMouseDown = (event: MouseEvent) => {
    this.mouseButtons.add(event.button);
    this.updateMouseButtons();
  };

  private handleMouseUp = (event: MouseEvent) => {
    this.mouseButtons.delete(event.button);
    this.updateMouseButtons();
  };

  private handlePointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.rootElement;
    this.updatePointerLockState();

    if (this.isPointerLocked) {
      console.log('Pointer locked - FPS controls enabled');
    } else {
      console.log('Pointer unlocked - Click canvas to re-enable FPS controls');
    }
  };

  private handlePointerLockError = () => {
    console.error('Pointer lock failed');
    this.isPointerLocked = false;
    this.updatePointerLockState();
  };

  private updateKeyboardState(): void {
    for (const entity of this.inputEntities) {
      const inputComponent = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);
      if (inputComponent) {
        inputComponent.setState({
          forward: this.keyState.forward,
          backward: this.keyState.backward,
          left: this.keyState.left,
          right: this.keyState.right,
          up: this.keyState.up,
          down: this.keyState.down,
          sprint: this.keyState.sprint,
        });
      }
    }
  }

  private updateMouseDelta(deltaX: number, deltaY: number): void {
    for (const entity of this.inputEntities) {
      const inputComponent = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);
      if (inputComponent) {
        inputComponent.setState({
          mouseDeltaX: deltaX,
          mouseDeltaY: deltaY,
        });
      }
    }
  }

  private updateMouseButtons(): void {
    for (const entity of this.inputEntities) {
      const inputComponent = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);
      if (inputComponent) {
        inputComponent.setState({
          mouseButtons: new Set(this.mouseButtons),
        });
      }
    }
  }

  private updatePointerLockState(): void {
    for (const entity of this.inputEntities) {
      const inputComponent = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);
      if (inputComponent) {
        inputComponent.setState({
          isMouseLocked: this.isPointerLocked,
        });
      }
    }
  }

  update(deltaTime: number): void {
    // clear mouse delta every frame
    for (const entity of this.inputEntities) {
      const inputComponent = entity.getComponent<Input3DComponent>(Input3DComponent.componentName);
      if (inputComponent) {
        inputComponent.clearMouseDelta();
      }
    }
  }
}
