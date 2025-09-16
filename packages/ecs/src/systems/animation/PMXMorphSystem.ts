/**
 * PMX Morph System - Handles both Type 1 and Type 2 morphs
 *
 * Type 1 (Vertex) Morphs:
 * - Managed by PMXMorphComponent
 * - Applied directly in GPU shader
 * - No CPU processing needed
 *
 * Type 2 (Bone) Morphs:
 * - Accumulated and applied to bone transformations
 * - Processed every frame by this system
 */

import { PMXBoneComponent } from '@ecs/components';
import { PMXMorphComponent } from '@ecs/components/rendering/PMXMorphComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { Vec3 } from '@ecs/types/types';

export class PMXMorphSystem extends System {
  constructor() {
    super('PMXMorphSystem', SystemPriorities.ANIMATION, 'render');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([PMXMorphComponent, PMXBoneComponent]);

    for (const entity of entities) {
      const morphComponent = entity.getComponent<PMXMorphComponent>(
        PMXMorphComponent.componentName,
      );
      const boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);

      if (!morphComponent || !boneComponent) continue;

      // Process Type 2 (Bone) morphs only
      this.processBoneMorphs(morphComponent, boneComponent);
    }
  }

  /**
   * Process Type 2 (Bone) morphs
   */
  private processBoneMorphs(
    morphComponent: PMXMorphComponent,
    boneComponent: PMXBoneComponent,
  ): void {
    // Get active bone morphs
    const activeBoneMorphs = morphComponent.getActiveBoneMorphs();

    if (activeBoneMorphs.length === 0) {
      // No active bone morphs, reset bones to base state
      boneComponent.resetAllBones();
      return;
    }

    // Reduce log frequency - only log when processing significant changes
    if (activeBoneMorphs.length > 0 && activeBoneMorphs[0].weight > 0.9) {
      console.log(`[PMXMorphSystem] Processing ${activeBoneMorphs.length} active bone morphs`);
    }

    // Accumulate bone morph offsets
    const accumulatedOffsets = new Map<number, { position: Vec3; rotation: Vec3 }>();

    for (const morphState of activeBoneMorphs) {
      if (morphState.weight <= 0) continue;

      const boneMorphData = morphComponent.getBoneMorphData(morphState.morphIndex);
      if (!boneMorphData) {
        console.log(`[PMXMorphSystem] Morph ${morphState.morphIndex} not found in boneMorphs!`);
        continue;
      }

      // Accumulate offsets for each bone affected by this morph
      for (const [boneIndex, offset] of boneMorphData.boneOffsets) {
        if (!accumulatedOffsets.has(boneIndex)) {
          accumulatedOffsets.set(boneIndex, { position: [0, 0, 0], rotation: [0, 0, 0] });
        }

        const acc = accumulatedOffsets.get(boneIndex)!;
        const weight = morphState.weight;

        // Accumulate position offset with scale factor for debugging
        // PMX morph offsets might be in different units than expected
        const positionScale = 1.0; // Try reducing this if positions are too extreme
        acc.position[0] += offset.positionOffset[0] * weight * positionScale;
        acc.position[1] += offset.positionOffset[1] * weight * positionScale;
        acc.position[2] += offset.positionOffset[2] * weight * positionScale;

        // Accumulate rotation offset
        const rotationScale = 1.0; // Try reducing this if rotations are too extreme
        acc.rotation[0] += offset.rotationOffset[0] * weight * rotationScale;
        acc.rotation[1] += offset.rotationOffset[1] * weight * rotationScale;
        acc.rotation[2] += offset.rotationOffset[2] * weight * rotationScale;
      }
    }

    // Apply accumulated offsets to bones
    if (accumulatedOffsets.size > 0 && activeBoneMorphs[0].weight > 0.9) {
      console.log(`[PMXMorphSystem] Applying ${accumulatedOffsets.size} bone morph offsets`);
      for (const [boneIndex, offset] of accumulatedOffsets) {
        console.log(
          `  Bone ${boneIndex}: pos [${offset.position.map((v) => v.toFixed(3)).join(', ')}], rot [${offset.rotation.map((v) => v.toFixed(3)).join(', ')}]`,
        );
      }
    }
    boneComponent.applyAccumulatedBoneMorphs(accumulatedOffsets);
  }

  /**
   * Get system statistics for debugging
   */
  getStats(): {
    totalEntities: number;
    activeVertexMorphs: number;
    activeBoneMorphs: number;
  } {
    const entities = this.world.getEntitiesWithComponents([PMXMorphComponent]);
    let activeVertexMorphs = 0;
    let activeBoneMorphs = 0;

    for (const entity of entities) {
      const morphComponent = entity.getComponent(
        PMXMorphComponent.componentName,
      ) as PMXMorphComponent;
      if (morphComponent) {
        activeVertexMorphs += morphComponent.getActiveVertexMorphs().length;
        activeBoneMorphs += morphComponent.getActiveBoneMorphs().length;
      }
    }

    return {
      totalEntities: entities.length,
      activeVertexMorphs,
      activeBoneMorphs,
    };
  }
}
