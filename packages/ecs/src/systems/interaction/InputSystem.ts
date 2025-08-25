import { InputComponent } from '@ecs/components';
import { TransformComponent } from '@ecs/components/physics/TransformComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Point } from '@ecs/types/types';
import { isMobileDevice } from '@ecs/utils/platform';

const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
} as const;

type KeyMap = typeof KEY_MAP;
type Direction = KeyMap[keyof KeyMap];

export class InputSystem extends System {
  private keyState: Record<Direction, boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private isMobileDevice: boolean;

  private inputEntities: Set<Entity> = new Set();

  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private isTouching: boolean = false;
  private readonly TOUCH_THRESHOLD = 20; // touch move threshold, only trigger move when the distance is greater than the threshold

  // Mouse position tracking
  private mousePosition: Point = [0, 0];
  private viewport: [number, number, number, number] = [
    0,
    0,
    window.innerWidth,
    window.innerHeight,
  ];

  constructor() {
    super('InputSystem', SystemPriorities.INPUT, 'logic');
    // check if the device is mobile
    this.isMobileDevice = isMobileDevice();
  }

  init(): void {
    if (this.isMobileDevice) {
      // Add touch event listeners for mobile
      window.addEventListener('touchstart', this.handleTouchStart);
      window.addEventListener('touchmove', this.handleTouchMove);
      window.addEventListener('touchend', this.handleTouchEnd);
    } else {
      // Add keyboard event listeners for desktop
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
      // Add mouse event listeners for desktop
      window.addEventListener('mousemove', this.handleMouseMove);
    }

    // Update viewport on window resize
    window.addEventListener('resize', this.handleWindowResize);

    // Initialize input entities set
    this.updateInputEntities();

    // Subscribe to entity changes
    this.world.onEntityAdded.subscribe(this.handleEntityAdded);
    this.world.onEntityRemoved.subscribe(this.handleEntityRemoved);
  }

  destroy(): void {
    if (this.isMobileDevice) {
      window.removeEventListener('touchstart', this.handleTouchStart);
      window.removeEventListener('touchmove', this.handleTouchMove);
      window.removeEventListener('touchend', this.handleTouchEnd);
      window.removeEventListener('touchcancel', this.handleTouchEnd);
    } else {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }

    // Unsubscribe from entity changes
    this.world.onEntityAdded.unsubscribe(this.handleEntityAdded);
    this.world.onEntityRemoved.unsubscribe(this.handleEntityRemoved);

    this.inputEntities.clear();
  }

  private handleEntityAdded = (entity: Entity) => {
    if (entity.hasComponent(InputComponent.componentName)) {
      this.inputEntities.add(entity);
    }
  };

  private handleEntityRemoved = (entity: Entity) => {
    this.inputEntities.delete(entity);
  };

  private updateInputEntities(): void {
    this.inputEntities.clear();
    const entities = this.world.getEntitiesByCondition((entity) =>
      entity.hasComponent(InputComponent.componentName),
    );
    for (const entity of entities) {
      this.inputEntities.add(entity);
    }
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    const direction = KEY_MAP[event.key as keyof KeyMap];
    if (direction) {
      this.keyState[direction] = true;
      this.updateInputComponents();
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    const direction = KEY_MAP[event.key as keyof KeyMap];
    if (direction) {
      this.keyState[direction] = false;
      this.updateInputComponents();
    }
  };

  private handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 0) {
      this.isTouching = true;
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    }
  };

  private handleTouchMove = (event: TouchEvent) => {
    if (!this.isTouching || event.touches.length === 0) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // reset all direction state
    this.keyState = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    // only trigger move when the distance is greater than the threshold
    if (Math.abs(deltaX) > this.TOUCH_THRESHOLD || Math.abs(deltaY) > this.TOUCH_THRESHOLD) {
      // check the main direction
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // horizontal move
        this.keyState.left = deltaX < 0;
        this.keyState.right = deltaX > 0;
      } else {
        // vertical move
        this.keyState.up = deltaY < 0;
        this.keyState.down = deltaY > 0;
      }
    }

    this.updateInputComponents();
  };

  private handleTouchEnd = () => {
    this.isTouching = false;
    // reset all direction state
    this.keyState = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    this.updateInputComponents();
  };

  private updateInputComponents(): void {
    // Only update entities that have Input component
    for (const entity of this.inputEntities) {
      const inputComponent = entity.getComponent<InputComponent>(InputComponent.componentName);
      inputComponent.setState(this.keyState);
    }
  }

  update(deltaTime: number): void {
    // Input is handled by event listeners
  }

  /**
   * Get mouse position in game world coordinates
   * This converts screen coordinates to game world coordinates based on player position
   */
  getMousePosition(): Point {
    return [...this.mousePosition];
  }

  /**
   * Convert screen coordinates to game world coordinates
   * Since player is always at the center of the screen, we calculate:
   * Game world position = Screen position - (Viewport center - Player position)
   */
  private convertScreenToGameCoordinates(screenX: number, screenY: number): Point {
    try {
      // Get player entity
      const playerEntities = this.world.getEntitiesByType('player');
      if (playerEntities.length > 0) {
        const player = playerEntities[0];
        const transform = player.getComponent<TransformComponent>(TransformComponent.componentName);

        if (transform) {
          const playerPosition = transform.getPosition();
          const [playerX, playerY] = playerPosition;

          // Get viewport dimensions
          const [vx, vy, vw, vh] = this.viewport;
          const viewportCenterX = vx + vw / 2;
          const viewportCenterY = vy + vh / 2;

          // Calculate camera offset (how much the world is shifted to keep player centered)
          const cameraOffsetX = viewportCenterX - playerX;
          const cameraOffsetY = viewportCenterY - playerY;

          // Convert screen coordinates to game world coordinates
          // Game world position = Screen position - Camera offset
          const gameX = screenX - cameraOffsetX;
          const gameY = screenY - cameraOffsetY;

          return [gameX, gameY];
        }
      }
    } catch (error) {
      // Fallback to screen coordinates if conversion fails
      console.warn('Failed to convert mouse position to game coordinates:', error);
    }

    // Fallback: return screen coordinates if conversion fails
    return [screenX, screenY];
  }

  private handleMouseMove = (event: MouseEvent) => {
    // Convert screen coordinates to game world coordinates
    this.mousePosition = this.convertScreenToGameCoordinates(event.clientX, event.clientY);
  };

  private handleWindowResize = () => {
    this.viewport = [0, 0, window.innerWidth, window.innerHeight];
  };
}
