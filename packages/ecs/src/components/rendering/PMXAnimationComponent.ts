/**
 * PMX Animation Component - High-level animation control for PMX models
 * Manages both morph and bone animations with timeline and blending support
 */

import { Component } from '@ecs/core/ecs/Component';
import { PMXBoneComponent } from './PMXBoneComponent';
import { PMXMorphComponent } from './PMXMorphComponent';

export interface PMXAnimationClip {
  name: string;
  duration: number; // Duration in seconds
  morphKeyframes: Map<number, Map<number, number>>; // time -> morphIndex -> weight
  boneKeyframes: Map<
    number,
    Map<
      number,
      {
        position?: [number, number, number];
        rotation?: [number, number, number];
        scale?: [number, number, number];
      }
    >
  >; // time -> boneIndex -> transform
  loop: boolean;
}

export interface PMXAnimationState {
  currentClip: string | null;
  time: number; // Current playback time
  speed: number; // Playback speed multiplier
  weight: number; // Animation weight for blending (0.0 to 1.0)
  enabled: boolean;
}

export interface PMXAnimationComponentData extends Record<string, any> {
  assetId: string; // PMX model asset ID
  clips: Map<string, PMXAnimationClip>; // Animation clips by name
  state: PMXAnimationState;
  morphComponent: PMXMorphComponent | null;
  boneComponent: PMXBoneComponent | null;
}

interface PMXAnimationComponentProps {
  assetId: string;
}

export class PMXAnimationComponent extends Component<PMXAnimationComponentData> {
  static readonly componentName = 'PMXAnimationComponent';

  constructor(props: PMXAnimationComponentProps) {
    super('PMXAnimationComponent', {
      assetId: props.assetId || '',
      clips: new Map(),
      state: {
        currentClip: null,
        time: 0,
        speed: 1.0,
        weight: 1.0,
        enabled: true,
      },
      morphComponent: null,
      boneComponent: null,
    });
  }

  /**
   * Set the morph and bone components for this animation
   * @param morphComponent PMX morph component
   * @param boneComponent PMX bone component
   */
  setComponents(morphComponent: PMXMorphComponent, boneComponent: PMXBoneComponent): void {
    this.data.morphComponent = morphComponent;
    this.data.boneComponent = boneComponent;
  }

  /**
   * Add an animation clip
   * @param clip Animation clip to add
   */
  addClip(clip: PMXAnimationClip): void {
    this.data.clips.set(clip.name, clip);
  }

  /**
   * Remove an animation clip
   * @param clipName Name of the clip to remove
   */
  removeClip(clipName: string): void {
    this.data.clips.delete(clipName);
  }

  /**
   * Get an animation clip
   * @param clipName Name of the clip
   * @returns Animation clip or null if not found
   */
  getClip(clipName: string): PMXAnimationClip | null {
    return this.data.clips.get(clipName) || null;
  }

  /**
   * Play an animation clip
   * @param clipName Name of the clip to play
   * @param speed Playback speed (default: 1.0)
   * @param weight Animation weight for blending (default: 1.0)
   */
  playClip(clipName: string, speed: number = 1.0, weight: number = 1.0): void {
    const clip = this.getClip(clipName);
    if (!clip) {
      console.warn(`[PMXAnimationComponent] Animation clip not found: ${clipName}`);
      return;
    }

    this.data.state.currentClip = clipName;
    this.data.state.time = 0;
    this.data.state.speed = speed;
    this.data.state.weight = Math.max(0.0, Math.min(1.0, weight));
    this.data.state.enabled = true;
  }

  /**
   * Stop current animation
   */
  stopAnimation(): void {
    this.data.state.currentClip = null;
    this.data.state.time = 0;
    this.data.state.enabled = false;
  }

  /**
   * Pause current animation
   */
  pauseAnimation(): void {
    this.data.state.enabled = false;
  }

  /**
   * Resume current animation
   */
  resumeAnimation(): void {
    this.data.state.enabled = true;
  }

  /**
   * Set animation time
   * @param time Time in seconds
   */
  setTime(time: number): void {
    this.data.state.time = Math.max(0, time);
  }

  /**
   * Set animation speed
   * @param speed Speed multiplier
   */
  setSpeed(speed: number): void {
    this.data.state.speed = speed;
  }

  /**
   * Set animation weight for blending
   * @param weight Weight value (0.0 to 1.0)
   */
  setWeight(weight: number): void {
    this.data.state.weight = Math.max(0.0, Math.min(1.0, weight));
  }

  /**
   * Update animation (called by animation system)
   * @param deltaTime Time delta in seconds
   */
  update(deltaTime: number): void {
    if (!this.data.state.enabled || !this.data.state.currentClip) {
      return;
    }

    const clip = this.getClip(this.data.state.currentClip);
    if (!clip) {
      this.stopAnimation();
      return;
    }

    // Update time
    this.data.state.time += deltaTime * this.data.state.speed;

    // Handle looping
    if (clip.loop && this.data.state.time >= clip.duration) {
      this.data.state.time = this.data.state.time % clip.duration;
    } else if (!clip.loop && this.data.state.time >= clip.duration) {
      this.data.state.time = clip.duration;
      this.stopAnimation();
      return;
    }

    // Apply animation
    this.applyAnimation(clip, this.data.state.time, this.data.state.weight);
  }

  /**
   * Apply animation at specific time
   * @param clip Animation clip to apply
   * @param time Time in seconds
   * @param weight Animation weight
   */
  private applyAnimation(clip: PMXAnimationClip, time: number, weight: number): void {
    // Apply morph keyframes
    if (this.data.morphComponent && clip.morphKeyframes.size > 0) {
      this.applyMorphKeyframes(clip, time, weight);
    }

    // Apply bone keyframes
    if (this.data.boneComponent && clip.boneKeyframes.size > 0) {
      this.applyBoneKeyframes(clip, time, weight);
    }
  }

  /**
   * Apply morph keyframes at specific time
   * @param clip Animation clip
   * @param time Time in seconds
   * @param weight Animation weight
   */
  private applyMorphKeyframes(clip: PMXAnimationClip, time: number, weight: number): void {
    if (!this.data.morphComponent) return;

    // Find the two keyframes to interpolate between
    const keyframeTimes = Array.from(clip.morphKeyframes.keys()).sort((a, b) => a - b);
    let prevTime = 0;
    let nextTime = clip.duration;

    for (const keyTime of keyframeTimes) {
      if (keyTime <= time) {
        prevTime = keyTime;
      }
      if (keyTime >= time && keyTime < nextTime) {
        nextTime = keyTime;
      }
    }

    // Interpolate between keyframes
    const prevKeyframes = clip.morphKeyframes.get(prevTime);
    const nextKeyframes = clip.morphKeyframes.get(nextTime);

    if (prevKeyframes && nextKeyframes) {
      const t = prevTime === nextTime ? 0 : (time - prevTime) / (nextTime - prevTime);

      for (const [morphIndex, prevWeight] of prevKeyframes) {
        const nextWeight = nextKeyframes.get(morphIndex) || 0;
        const interpolatedWeight = prevWeight + (nextWeight - prevWeight) * t;
        this.data.morphComponent.setMorphWeight(morphIndex, interpolatedWeight * weight);
      }
    } else if (prevKeyframes) {
      // Only previous keyframe exists
      for (const [morphIndex, prevWeight] of prevKeyframes) {
        this.data.morphComponent.setMorphWeight(morphIndex, prevWeight * weight);
      }
    }
  }

  /**
   * Apply bone keyframes at specific time
   * @param clip Animation clip
   * @param time Time in seconds
   * @param weight Animation weight
   */
  private applyBoneKeyframes(clip: PMXAnimationClip, time: number, weight: number): void {
    if (!this.data.boneComponent) return;

    // Find the two keyframes to interpolate between
    const keyframeTimes = Array.from(clip.boneKeyframes.keys()).sort((a, b) => a - b);
    let prevTime = 0;
    let nextTime = clip.duration;

    for (const keyTime of keyframeTimes) {
      if (keyTime <= time) {
        prevTime = keyTime;
      }
      if (keyTime >= time && keyTime < nextTime) {
        nextTime = keyTime;
      }
    }

    // Interpolate between keyframes
    const prevKeyframes = clip.boneKeyframes.get(prevTime);
    const nextKeyframes = clip.boneKeyframes.get(nextTime);

    if (prevKeyframes && nextKeyframes) {
      const t = prevTime === nextTime ? 0 : (time - prevTime) / (nextTime - prevTime);

      for (const [boneIndex, prevTransform] of prevKeyframes) {
        const nextTransform = nextKeyframes.get(boneIndex);
        if (nextTransform) {
          // Interpolate position
          if (prevTransform.position && nextTransform.position) {
            const interpolatedPos: [number, number, number] = [
              prevTransform.position[0] +
                (nextTransform.position[0] - prevTransform.position[0]) * t,
              prevTransform.position[1] +
                (nextTransform.position[1] - prevTransform.position[1]) * t,
              prevTransform.position[2] +
                (nextTransform.position[2] - prevTransform.position[2]) * t,
            ];
            this.data.boneComponent.setBonePosition(boneIndex, interpolatedPos);
          }

          // Interpolate rotation
          if (prevTransform.rotation && nextTransform.rotation) {
            const interpolatedRot: [number, number, number] = [
              prevTransform.rotation[0] +
                (nextTransform.rotation[0] - prevTransform.rotation[0]) * t,
              prevTransform.rotation[1] +
                (nextTransform.rotation[1] - prevTransform.rotation[1]) * t,
              prevTransform.rotation[2] +
                (nextTransform.rotation[2] - prevTransform.rotation[2]) * t,
            ];
            this.data.boneComponent.setBoneRotation(boneIndex, interpolatedRot);
          }

          // Interpolate scale
          if (prevTransform.scale && nextTransform.scale) {
            const interpolatedScale: [number, number, number] = [
              prevTransform.scale[0] + (nextTransform.scale[0] - prevTransform.scale[0]) * t,
              prevTransform.scale[1] + (nextTransform.scale[1] - prevTransform.scale[1]) * t,
              prevTransform.scale[2] + (nextTransform.scale[2] - prevTransform.scale[2]) * t,
            ];
            this.data.boneComponent.setBoneScale(boneIndex, interpolatedScale);
          }
        }
      }
    } else if (prevKeyframes) {
      // Only previous keyframe exists
      for (const [boneIndex, prevTransform] of prevKeyframes) {
        if (prevTransform.position) {
          this.data.boneComponent.setBonePosition(boneIndex, prevTransform.position);
        }
        if (prevTransform.rotation) {
          this.data.boneComponent.setBoneRotation(boneIndex, prevTransform.rotation);
        }
        if (prevTransform.scale) {
          this.data.boneComponent.setBoneScale(boneIndex, prevTransform.scale);
        }
      }
    }
  }

  /**
   * Get current animation state
   * @returns Current animation state
   */
  getState(): PMXAnimationState {
    return { ...this.data.state };
  }

  /**
   * Check if animation is playing
   * @returns Whether animation is currently playing
   */
  isPlaying(): boolean {
    return this.data.state.enabled && this.data.state.currentClip !== null;
  }

  /**
   * Get current animation time
   * @returns Current time in seconds
   */
  getCurrentTime(): number {
    return this.data.state.time;
  }

  /**
   * Get current animation duration
   * @returns Duration in seconds, or 0 if no animation is playing
   */
  getCurrentDuration(): number {
    const clip = this.getClip(this.data.state.currentClip || '');
    return clip ? clip.duration : 0;
  }
}
