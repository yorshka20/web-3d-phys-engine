/**
 * PMX Animation System - High-level animation control for PMX models
 * Manages animation clips, timeline, and blending between animations
 */

import {
  PMXAnimationComponent,
  PMXAnimationState,
} from '@ecs/components/rendering/PMXAnimationComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class PMXAnimationSystem extends System {
  constructor() {
    super('PMXAnimationSystem', SystemPriorities.ANIMATION, 'render');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([PMXAnimationComponent]);

    for (const entity of entities) {
      const animationComponent = entity.getComponent(PMXAnimationComponent.componentName);
      if (!animationComponent) continue;

      // Update animation timeline
      animationComponent.update(deltaTime);
    }
  }

  /**
   * Play animation on a specific entity
   * @param entityId Entity ID
   * @param clipName Animation clip name
   * @param speed Playback speed (default: 1.0)
   * @param weight Animation weight for blending (default: 1.0)
   */
  playAnimation(
    entityId: string,
    clipName: string,
    speed: number = 1.0,
    weight: number = 1.0,
  ): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) {
      console.warn(`[PMXAnimationSystem] Entity ${entityId} not found`);
      return;
    }

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) {
      console.warn(`[PMXAnimationSystem] Entity ${entityId} does not have PMXAnimationComponent`);
      return;
    }

    animationComponent.playClip(clipName, speed, weight);
  }

  /**
   * Stop animation on a specific entity
   * @param entityId Entity ID
   */
  stopAnimation(entityId: string): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return;

    animationComponent.stopAnimation();
  }

  /**
   * Pause animation on a specific entity
   * @param entityId Entity ID
   */
  pauseAnimation(entityId: string): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return;

    animationComponent.pauseAnimation();
  }

  /**
   * Resume animation on a specific entity
   * @param entityId Entity ID
   */
  resumeAnimation(entityId: string): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return;

    animationComponent.resumeAnimation();
  }

  /**
   * Set animation time on a specific entity
   * @param entityId Entity ID
   * @param time Time in seconds
   */
  setAnimationTime(entityId: string, time: number): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return;

    animationComponent.setTime(time);
  }

  /**
   * Set animation speed on a specific entity
   * @param entityId Entity ID
   * @param speed Speed multiplier
   */
  setAnimationSpeed(entityId: string, speed: number): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return;

    animationComponent.setSpeed(speed);
  }

  /**
   * Set animation weight on a specific entity
   * @param entityId Entity ID
   * @param weight Weight value (0.0 to 1.0)
   */
  setAnimationWeight(entityId: number, weight: number): void {
    const entity = this.world.getEntityByNumericId(entityId);
    if (!entity) return;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return;

    animationComponent.setWeight(weight);
  }

  /**
   * Get animation state for a specific entity
   * @param entityId Entity ID
   * @returns Animation state or null if not found
   */
  getAnimationState(entityId: string): PMXAnimationState | null {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return null;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return null;

    return animationComponent.getState();
  }

  /**
   * Check if animation is playing on a specific entity
   * @param entityId Entity ID
   * @returns Whether animation is playing
   */
  isAnimationPlaying(entityId: string): boolean {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return false;

    const animationComponent = entity.getComponent<PMXAnimationComponent>(
      PMXAnimationComponent.componentName,
    );
    if (!animationComponent) return false;

    return animationComponent.isPlaying();
  }

  /**
   * Get animation statistics for debugging
   * @returns Animation system statistics
   */
  getStats(): {
    totalEntities: number;
    playingAnimations: number;
    totalClips: number;
  } {
    const entities = this.world.getEntitiesWithComponents([PMXAnimationComponent]);
    let playingAnimations = 0;
    let totalClips = 0;

    for (const entity of entities) {
      const animationComponent = entity.getComponent(
        PMXAnimationComponent.componentName,
      ) as PMXAnimationComponent;
      if (animationComponent) {
        if (animationComponent.isPlaying()) {
          playingAnimations++;
        }
        totalClips += animationComponent.data.clips.size;
      }
    }

    return {
      totalEntities: entities.length,
      playingAnimations,
      totalClips,
    };
  }
}
