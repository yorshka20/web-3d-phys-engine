/**
 * PMX Animation Controller - High-level API for controlling PMX model animations
 * Provides easy-to-use methods for playing morphs, bone animations, and managing animation states
 */

import { PMXMeshComponent } from '@ecs/components/physics/mesh/PMXMeshComponent';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import {
  PMXAnimationComponent,
  PMXAnimationState,
} from '@ecs/components/rendering/PMXAnimationComponent';
import { PMXBoneComponent } from '@ecs/components/rendering/PMXBoneComponent';
import { PMXMorphComponent } from '@ecs/components/rendering/PMXMorphComponent';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { PMXAnimationSystem } from './PMXAnimationSystem';

export interface PMXAnimationPreset {
  name: string;
  morphs: Map<number, number>; // morphIndex -> weight
  bones: Map<
    number,
    {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    }
  >; // boneIndex -> transform
  duration: number;
  loop: boolean;
}

export interface PMXAnimationBlend {
  fromPreset: string;
  toPreset: string;
  blendFactor: number; // 0.0 to 1.0
  duration: number;
}

export class PMXAnimationController {
  private world: World;
  private animationSystem: PMXAnimationSystem;
  private presets: Map<string, PMXAnimationPreset> = new Map();
  private activeBlends: Map<number, PMXAnimationBlend> = new Map(); // entityId -> blend

  constructor(world: World) {
    this.world = world;
    this.animationSystem = new PMXAnimationSystem();
    world.addSystem(this.animationSystem);
  }

  /**
   * Initialize animation components for a PMX entity
   * @param entity Entity
   */
  initializePMXAnimation(entity: Entity): void {
    console.log(`[PMXAnimationController] Initializing animation for entity ${entity.id}`);

    if (!entity.hasComponent(PMXMeshComponent.componentName)) {
      console.warn(`[PMXAnimationController] PMX mesh component not found for entity ${entity.id}`);
      return;
    }

    const pmxMeshComponent = entity.getComponent<PMXMeshComponent>(PMXMeshComponent.componentName);
    if (!pmxMeshComponent) {
      console.warn(`[PMXAnimationController] PMX mesh component not found for entity ${entity.id}`);
      return;
    }

    const assetDescriptor = pmxMeshComponent.resolveAsset();
    const { assetId } = pmxMeshComponent;
    const pmxModel = assetDescriptor?.rawData as PMXModel;
    const { bones, morphs, metadata } = pmxModel;

    // Create morph component
    const morphComponent = new PMXMorphComponent({
      assetId,
      morphCount: metadata.morphCount,
      boneCount: metadata.boneCount,
      frameCount: metadata.frameCount,
      vertexCount: metadata.vertexCount,
      morphs,
    });

    // Create bone component
    const boneComponent = new PMXBoneComponent({
      assetId,
      bones,
    });

    // Create animation component
    const animationComponent = new PMXAnimationComponent({
      assetId,
    });

    // Set component references
    animationComponent.setComponents(morphComponent, boneComponent);

    // Add components to entity
    entity.addComponent(morphComponent);
    entity.addComponent(boneComponent);
    entity.addComponent(animationComponent);

    console.log(`[PMXAnimationController] Initialized animation for entity ${entity.id}`);
  }

  /**
   * Add an animation preset
   * @param preset Animation preset to add
   */
  addPreset(preset: PMXAnimationPreset): void {
    this.presets.set(preset.name, preset);
    console.log(`[PMXAnimationController] Added preset: ${preset.name}`);
  }

  /**
   * Remove an animation preset
   * @param presetName Name of the preset to remove
   */
  removePreset(presetName: string): void {
    this.presets.delete(presetName);
    console.log(`[PMXAnimationController] Removed preset: ${presetName}`);
  }

  private applyMorphByType(
    morphComponent: PMXMorphComponent,
    boneComponent: PMXBoneComponent,
    morphIndex: number,
    weight: number,
    enabled: boolean,
  ): void {
    const morphData = morphComponent.getMorphData(morphIndex);
    if (!morphData) return;

    if (morphData.type === 1) {
      // Type 1: apply vertex morph
      morphComponent.setMorphWeight(morphIndex, weight, enabled);
    } else if (morphData.type === 2) {
      // Type 2: apply bone morph
      this.applyBoneMorph(boneComponent, morphComponent, morphIndex, weight, enabled);
    }
  }

  private applyBoneMorph(
    boneComponent: PMXBoneComponent,
    morphComponent: PMXMorphComponent,
    morphIndex: number,
    weight: number,
    enabled: boolean,
  ): void {
    // For Type 2 morphs, we just set the weight in the morph component
    // The PMXMorphSystem will handle the actual bone transformation
    morphComponent.setMorphWeight(morphIndex, weight, enabled);
  }

  /**
   * Play a morph animation on an entity
   * @param entityId Entity ID
   * @param morphIndex Morph index
   * @param weight Morph weight (0.0 to 1.0)
   * @param enabled Whether the morph is enabled
   */
  playMorph(entityId: string, morphIndex: number, weight: number, enabled: boolean = true): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const morphComponent = entity.getComponent<PMXMorphComponent>(PMXMorphComponent.componentName);
    const boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);

    if (!morphComponent || !boneComponent) return;

    this.applyMorphByType(morphComponent, boneComponent, morphIndex, weight, enabled);
  }

  /**
   * Stop a morph animation on an entity
   * @param entityId Entity ID
   * @param morphIndex Morph index
   */
  stopMorph(entityId: string, morphIndex: number): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const morphComponent = entity.getComponent<PMXMorphComponent>(PMXMorphComponent.componentName);
    if (!morphComponent) return;

    morphComponent.setMorphEnabled(morphIndex, false);
  }

  /**
   * Set bone transform on an entity
   * @param entityId Entity ID
   * @param boneIndex Bone index
   * @param transform Bone transform
   */
  setBoneTransform(
    entityId: string,
    boneIndex: number,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    },
  ): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);
    if (!boneComponent) return;

    boneComponent.setBoneTransform(boneIndex, transform);
  }

  /**
   * Apply a preset to an entity
   * @param entityId Entity ID
   * @param presetName Name of the preset to apply
   * @param blendFactor Blend factor for smooth transition (0.0 to 1.0)
   */
  applyPreset(entityId: string, presetName: string, blendFactor: number = 1.0): void {
    const preset = this.presets.get(presetName);
    if (!preset) {
      console.warn(`[PMXAnimationController] Preset not found: ${presetName}`);
      return;
    }

    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const morphComponent = entity.getComponent<PMXMorphComponent>(PMXMorphComponent.componentName);
    const boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);

    if (!morphComponent || !boneComponent) {
      console.warn(
        `[PMXAnimationController] Animation components not found for entity ${entityId}`,
      );
      return;
    }

    // Apply morphs
    for (const [morphIndex, weight] of preset.morphs) {
      this.applyMorphByType(
        morphComponent,
        boneComponent,
        morphIndex,
        weight * blendFactor,
        weight > 0,
      );
    }

    // Apply bone transforms
    for (const [boneIndex, transform] of preset.bones) {
      boneComponent.setBoneTransform(boneIndex, transform);
    }

    console.log(`[PMXAnimationController] Applied preset ${presetName} to entity ${entityId}`);
  }

  /**
   * Blend between two presets on an entity
   * @param entityId Entity ID
   * @param fromPreset Source preset name
   * @param toPreset Target preset name
   * @param blendFactor Blend factor (0.0 = from, 1.0 = to)
   */
  blendPresets(entityId: string, fromPreset: string, toPreset: string, blendFactor: number): void {
    const fromPresetData = this.presets.get(fromPreset);
    const toPresetData = this.presets.get(toPreset);

    if (!fromPresetData || !toPresetData) {
      console.warn(`[PMXAnimationController] Preset not found: ${fromPreset} or ${toPreset}`);
      return;
    }

    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const morphComponent = entity.getComponent(
      PMXMorphComponent.componentName,
    ) as PMXMorphComponent;
    const boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);

    if (!morphComponent || !boneComponent) {
      console.warn(
        `[PMXAnimationController] Animation components not found for entity ${entityId}`,
      );
      return;
    }

    // Blend morphs(include type1 and type2)
    const allMorphIndices = new Set([
      ...fromPresetData.morphs.keys(),
      ...toPresetData.morphs.keys(),
    ]);

    for (const morphIndex of allMorphIndices) {
      const fromWeight = fromPresetData.morphs.get(morphIndex) || 0;
      const toWeight = toPresetData.morphs.get(morphIndex) || 0;
      const blendedWeight = fromWeight + (toWeight - fromWeight) * blendFactor;
      this.applyMorphByType(
        morphComponent,
        boneComponent,
        morphIndex,
        blendedWeight,
        blendedWeight > 0,
      );
    }

    // Blend bone transforms
    const allBoneIndices = new Set([...fromPresetData.bones.keys(), ...toPresetData.bones.keys()]);

    for (const boneIndex of allBoneIndices) {
      const fromTransform = fromPresetData.bones.get(boneIndex) || {};
      const toTransform = toPresetData.bones.get(boneIndex) || {};

      const blendedTransform: any = {};

      // Blend position
      if (fromTransform.position && toTransform.position) {
        blendedTransform.position = [
          fromTransform.position[0] +
            (toTransform.position[0] - fromTransform.position[0]) * blendFactor,
          fromTransform.position[1] +
            (toTransform.position[1] - fromTransform.position[1]) * blendFactor,
          fromTransform.position[2] +
            (toTransform.position[2] - fromTransform.position[2]) * blendFactor,
        ];
      } else if (toTransform.position) {
        blendedTransform.position = toTransform.position;
      } else if (fromTransform.position) {
        blendedTransform.position = fromTransform.position;
      }

      // Blend rotation
      if (fromTransform.rotation && toTransform.rotation) {
        blendedTransform.rotation = [
          fromTransform.rotation[0] +
            (toTransform.rotation[0] - fromTransform.rotation[0]) * blendFactor,
          fromTransform.rotation[1] +
            (toTransform.rotation[1] - fromTransform.rotation[1]) * blendFactor,
          fromTransform.rotation[2] +
            (toTransform.rotation[2] - fromTransform.rotation[2]) * blendFactor,
        ];
      } else if (toTransform.rotation) {
        blendedTransform.rotation = toTransform.rotation;
      } else if (fromTransform.rotation) {
        blendedTransform.rotation = fromTransform.rotation;
      }

      // Blend scale
      if (fromTransform.scale && toTransform.scale) {
        blendedTransform.scale = [
          fromTransform.scale[0] + (toTransform.scale[0] - fromTransform.scale[0]) * blendFactor,
          fromTransform.scale[1] + (toTransform.scale[1] - fromTransform.scale[1]) * blendFactor,
          fromTransform.scale[2] + (toTransform.scale[2] - fromTransform.scale[2]) * blendFactor,
        ];
      } else if (toTransform.scale) {
        blendedTransform.scale = toTransform.scale;
      } else if (fromTransform.scale) {
        blendedTransform.scale = fromTransform.scale;
      }

      boneComponent.setBoneTransform(boneIndex, blendedTransform);
    }

    console.log(
      `[PMXAnimationController] Blended presets ${fromPreset} -> ${toPreset} on entity ${entityId}`,
    );
  }

  /**
   * Reset all animations on an entity
   * @param entityId Entity ID
   */
  resetAnimations(entityId: string): void {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return;

    const morphComponent = entity.getComponent<PMXMorphComponent>(PMXMorphComponent.componentName);
    const boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);

    if (morphComponent) {
      morphComponent.clearAllMorphs();
    }

    if (boneComponent) {
      boneComponent.resetAllBones();
    }

    console.log(`[PMXAnimationController] Reset animations for entity ${entityId}`);
  }

  /**
   * Get animation state for an entity
   * @param entityId Entity ID
   * @returns Animation state or null if not found
   */
  getAnimationState(entityId: string): PMXAnimationState | null {
    return this.animationSystem.getAnimationState(entityId);
  }

  /**
   * Check if entity has animation components
   * @param entityId Entity ID
   * @returns Whether entity has animation components
   */
  hasAnimationComponents(entityId: string): boolean {
    const entity = this.world.getEntityById(entityId);
    if (!entity) return false;

    return (
      entity.hasComponent(PMXMorphComponent.componentName) &&
      entity.hasComponent(PMXBoneComponent.componentName) &&
      entity.hasComponent(PMXAnimationComponent.componentName)
    );
  }

  /**
   * Get available presets
   * @returns Array of preset names
   */
  getAvailablePresets(): string[] {
    return Array.from(this.presets.keys());
  }

  /**
   * Get preset data
   * @param presetName Preset name
   * @returns Preset data or null if not found
   */
  getPreset(presetName: string): PMXAnimationPreset | null {
    return this.presets.get(presetName) || null;
  }

  /**
   * Create a simple morph preset
   * @param name Preset name
   * @param morphs Morph data
   * @returns Created preset
   */
  createMorphPreset(name: string, morphs: Record<number, number>): PMXAnimationPreset {
    const morphMap = new Map(Object.entries(morphs).map(([k, v]) => [parseInt(k), v]));

    return {
      name,
      morphs: morphMap,
      bones: new Map(),
      duration: 0,
      loop: false,
    };
  }

  /**
   * Create a simple bone preset
   * @param name Preset name
   * @param bones Bone data
   * @returns Created preset
   */
  createBonePreset(
    name: string,
    bones: Record<
      number,
      {
        position?: [number, number, number];
        rotation?: [number, number, number];
        scale?: [number, number, number];
      }
    >,
  ): PMXAnimationPreset {
    const boneMap = new Map(Object.entries(bones).map(([k, v]) => [parseInt(k), v]));

    return {
      name,
      morphs: new Map(),
      bones: boneMap,
      duration: 0,
      loop: false,
    };
  }
}
