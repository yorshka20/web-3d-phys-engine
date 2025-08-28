import { SPEED_MULTIPLIERS, calculateSpeed, calculateSpeedPerSecond } from '@ecs/constants/speed';
import { Component } from '@ecs/core/ecs/Component';
import { Vec2, Vec3 } from '@ecs/types/types';

type EntityType = 'PLAYER' | 'ENEMY' | 'PROJECTILE' | 'ITEM' | 'OBSTACLE';

interface PhysicsProps {
  velocity?: Vec2 | Vec3;
  speed?: number;
  entityType?: EntityType;
  friction?: number;
  maxSpeed?: number;
}

/**
 * Physics component for entities
 * Handles velocity, speed, and movement
 * Supports both 2D and 3D velocity (3D velocity defaults Z to 0 for 2D compatibility)
 *
 * @property {Vec2|Vec3} velocity - The velocity of the entity (pixels/second)
 * @property {number} speed - The speed of the entity (pixels/second)
 * @property {EntityType} entityType - The type of the entity
 * @property {number} friction - The friction of the entity
 * @property {number} maxSpeed - The maximum speed of the entity (pixels/second)
 */
export class PhysicsComponent extends Component {
  static componentName = 'Physics';

  // Velocity properties - always stored as Vec3 for 3D compatibility
  velocity: Vec3;
  private isBlocked: boolean = false;
  private blockedTimer: number = 0;
  private readonly BLOCKED_DURATION: number = 500; // 500ms blocked duration
  private readonly COLLISION_DAMPING: number = 0.5; // Damping factor for collision response
  private friction: number;

  // Sleep properties
  public isSleeping = false;
  public sleepTimer = 0;
  public readonly SLEEP_VELOCITY_THRESHOLD = 0.1; // pixels/second, very low threshold
  public readonly SLEEP_TIME_THRESHOLD = 2000; // 2 seconds

  // Movement properties
  speed: number;
  private maxSpeed: number;
  private acceleration: number;
  private entityType: EntityType;

  constructor(props: PhysicsProps = {}) {
    super('Physics');
    this.entityType = props.entityType ?? 'PLAYER';

    // Initialize velocity properties - always store as Vec3
    if (props.velocity) {
      if (props.velocity.length === 2) {
        // Convert Vec2 to Vec3
        this.velocity = [props.velocity[0], props.velocity[1], 0];
      } else {
        // Already Vec3
        this.velocity = [...props.velocity] as Vec3;
      }
    } else {
      this.velocity = [0, 0, 0];
    }
    this.friction = props.friction ?? 1;

    // Initialize movement properties
    // Convert frame-based speed constants to per-second to match system integration
    const baseSpeedPerFrame = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].BASE);
    const maxSpeedPerFrame = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    const baseSpeedPerSecond = calculateSpeedPerSecond(baseSpeedPerFrame);
    const maxSpeedPerSecond = calculateSpeedPerSecond(maxSpeedPerFrame);

    this.speed = props.speed ?? baseSpeedPerSecond;
    this.maxSpeed = props.maxSpeed ?? maxSpeedPerSecond;
    this.acceleration = 0.5;
  }

  // Velocity methods
  getVelocity(): Vec3 {
    return this.velocity;
  }

  getVelocity2D(): Vec2 {
    return [this.velocity[0], this.velocity[1]];
  }

  setVelocity(velocity: Vec2 | Vec3): void {
    if (this.isBlocked) {
      return;
    }

    // Convert to Vec3 if needed
    let newVelocity: Vec3;
    if (velocity.length === 2) {
      newVelocity = [velocity[0], velocity[1], this.velocity[2]]; // Preserve Z component
    } else {
      newVelocity = [...velocity] as Vec3;
    }

    // Wake up if a non-zero velocity is applied to a sleeping entity
    if (this.isSleeping && (newVelocity[0] !== 0 || newVelocity[1] !== 0 || newVelocity[2] !== 0)) {
      this.wakeUp();
    }

    this.velocity = newVelocity;

    // Limit speed (pixels/second) - calculate 3D magnitude
    const speed = Math.sqrt(this.velocity[0] ** 2 + this.velocity[1] ** 2 + this.velocity[2] ** 2);
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      this.velocity[0] *= scale;
      this.velocity[1] *= scale;
      this.velocity[2] *= scale;
    }
  }

  stop(): void {
    this.velocity[0] = 0;
    this.velocity[1] = 0;
    this.velocity[2] = 0;
  }

  handleCollision(collisionNormal: { x: number; y: number; z?: number }): void {
    // For 2D collision, Z component is ignored
    const dotProduct = this.velocity[0] * collisionNormal.x + this.velocity[1] * collisionNormal.y;
    if (dotProduct < 0) {
      this.velocity[0] += collisionNormal.x * dotProduct * this.COLLISION_DAMPING;
      this.velocity[1] += collisionNormal.y * dotProduct * this.COLLISION_DAMPING;
      // Z component is not affected by 2D collision
    }
  }

  handleCollision3D(collisionNormal: { x: number; y: number; z: number }): void {
    // For 3D collision, all components are considered
    const dotProduct =
      this.velocity[0] * collisionNormal.x +
      this.velocity[1] * collisionNormal.y +
      this.velocity[2] * collisionNormal.z;
    if (dotProduct < 0) {
      this.velocity[0] += collisionNormal.x * dotProduct * this.COLLISION_DAMPING;
      this.velocity[1] += collisionNormal.y * dotProduct * this.COLLISION_DAMPING;
      this.velocity[2] += collisionNormal.z * dotProduct * this.COLLISION_DAMPING;
    }
  }

  setBlocked(blocked: boolean): void {
    if (blocked && !this.isBlocked) {
      this.isBlocked = true;
      this.blockedTimer = this.BLOCKED_DURATION;
      this.stop();
    } else if (!blocked && this.isBlocked) {
      this.isBlocked = false;
      this.blockedTimer = 0;
    }
  }

  isCurrentlyBlocked(): boolean {
    return this.isBlocked;
  }

  // Sleep methods
  isAsleep(): boolean {
    return this.isSleeping;
  }

  wakeUp(): void {
    this.isSleeping = false;
    this.sleepTimer = 0;
  }

  // Movement methods
  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    // Clamp to [min, max] in pixels/second
    const minSpeedPerSecond = calculateSpeedPerSecond(
      calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MIN),
    );
    this.speed = Math.min(Math.max(speed, minSpeedPerSecond), this.maxSpeed);
  }

  getMaxSpeed(): number {
    return this.maxSpeed;
  }

  getAcceleration(): number {
    return this.acceleration;
  }

  getEntityType(): EntityType {
    return this.entityType;
  }

  update(deltaTime: number): void {
    if (this.isBlocked) {
      this.blockedTimer -= deltaTime * 1000;
      if (this.blockedTimer <= 0) {
        this.isBlocked = false;
      }
    }

    // Sleep logic - use 3D magnitude
    const speed = Math.sqrt(this.velocity[0] ** 2 + this.velocity[1] ** 2 + this.velocity[2] ** 2);
    if (speed < this.SLEEP_VELOCITY_THRESHOLD) {
      this.sleepTimer += deltaTime * 1000; // convert to ms
      if (this.sleepTimer >= this.SLEEP_TIME_THRESHOLD) {
        this.isSleeping = true;
      }
    } else {
      this.wakeUp();
    }
  }

  reset(): void {
    super.reset();
    // Reset velocity properties
    this.velocity[0] = 0;
    this.velocity[1] = 0;
    this.velocity[2] = 0;
    this.isBlocked = false;
    this.blockedTimer = 0;
    this.friction = 1;

    // Reset sleep properties
    this.isSleeping = false;
    this.sleepTimer = 0;

    // Reset movement properties (recompute in per-second units)
    const baseSpeedPerSecond = calculateSpeedPerSecond(
      calculateSpeed(SPEED_MULTIPLIERS[this.entityType].BASE),
    );
    const maxSpeedPerSecond = calculateSpeedPerSecond(
      calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX),
    );
    this.speed = baseSpeedPerSecond;
    this.maxSpeed = maxSpeedPerSecond;
    this.acceleration = 0.5;
  }
}
