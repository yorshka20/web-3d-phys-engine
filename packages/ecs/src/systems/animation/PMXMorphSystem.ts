/**
 * PMX Morph System - Updates morph weights and manages GPU data for vertex morphs
 * Handles Type 1 morphs (vertex position changes) for facial expressions and shape changes
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

      // 1. Reset all bone transforms to their base animated state (currently the bind pose).
      boneComponent.resetAllBones();

      // 2. Accumulate all active bone morph offsets.
      const accumulatedOffsets = new Map<number, { position: Vec3; rotation: Vec3 }>();
      const activeMorphs = morphComponent.getActiveMorphs();

      for (const morphState of activeMorphs) {
        if (morphComponent.isBoneMorph(morphState.morphIndex) && morphState.weight > 0) {
          const boneMorphData = morphComponent.getBoneMorphData(morphState.morphIndex);
          if (boneMorphData) {
            for (const [boneIndex, offset] of boneMorphData.boneOffsets) {
              if (!accumulatedOffsets.has(boneIndex)) {
                accumulatedOffsets.set(boneIndex, { position: [0, 0, 0], rotation: [0, 0, 0] });
              }
              const acc = accumulatedOffsets.get(boneIndex)!;
              acc.position[0] += offset.positionOffset[0] * morphState.weight;
              acc.position[1] += offset.positionOffset[1] * morphState.weight;
              acc.position[2] += offset.positionOffset[2] * morphState.weight;
              acc.rotation[0] += offset.rotationOffset[0] * morphState.weight;
              acc.rotation[1] += offset.rotationOffset[1] * morphState.weight;
              acc.rotation[2] += offset.rotationOffset[2] * morphState.weight;
            }
          }
        }
      }

      // 3. Apply the accumulated offsets to the bones.
      boneComponent.applyAccumulatedBoneMorphs(accumulatedOffsets);
    }
  }

  /**
   * Update GPU data for morph component
   * This would typically upload morph weights to GPU buffers
   * @param morphComponent Morph component to update
   */
  private updateMorphGPUData(morphComponent: PMXMorphComponent): void {
    // Get current morph weights
    const morphWeights = morphComponent.getMorphWeightsArray();

    // In a real implementation, this would upload to GPU buffers
    // For now, we just log the update
    const activeMorphs = morphComponent.getActiveMorphs();
    if (activeMorphs.length > 0) {
      console.log(
        `[PMXMorphSystem] Updated ${activeMorphs.length} active morphs for entity ${morphComponent.data.assetId}`,
      );
    }
  }

  /**
   * Get morph statistics for debugging
   * @returns Morph system statistics
   */
  getStats(): {
    totalEntities: number;
    activeMorphs: number;
    totalMorphWeights: number;
  } {
    const entities = this.world.getEntitiesWithComponents([PMXMorphComponent]);
    let activeMorphs = 0;
    let totalMorphWeights = 0;

    for (const entity of entities) {
      const morphComponent = entity.getComponent<PMXMorphComponent>(
        PMXMorphComponent.componentName,
      );
      if (morphComponent) {
        activeMorphs += morphComponent.getActiveMorphs().length;
        totalMorphWeights += morphComponent.getMorphWeightsArray().length;
      }
    }

    return {
      totalEntities: entities.length,
      activeMorphs,
      totalMorphWeights,
    };
  }
}
