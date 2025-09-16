/**
 * PMX Bone System - Updates bone matrices for GPU skinning
 * This system calculates the final bone transformations based on animation and morphs
 */

import { PMXBoneComponent } from '@ecs/components/rendering/PMXBoneComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class PMXBoneSystem extends System {
  constructor() {
    super('PMXBoneSystem', SystemPriorities.ANIMATION + 1, 'render'); // Run after morph system
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([PMXBoneComponent]);

    for (const entity of entities) {
      const boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);
      if (!boneComponent) continue;

      // Only update bone matrices if needed (e.g., after animation or morph updates)
      if (boneComponent.needsGPUUpdate()) {
        boneComponent.calculateBoneMatrices();
        // The needsUpdate flag is consumed by the renderer, so we don't reset it here.
        // boneComponent.markAsUpdated();

        const assetId = boneComponent.data.assetId;
        console.log(
          `[PMXBoneSystem] Updated ${boneComponent.getBoneCount()} bone matrices for entity ${assetId}`,
        );
      }
    }
  }

  /**
   * Update GPU data for bone component
   * This would typically upload bone matrices to GPU buffers
   * @param boneComponent Bone component to update
   */
  private updateBoneGPUData(boneComponent: PMXBoneComponent): void {
    // Get current bone matrices
    const boneMatrices = boneComponent.getBoneMatricesArray();

    // In a real implementation, this would upload to GPU buffers
    // For now, we just log the update
    const boneCount = boneComponent.getBoneCount();
    if (boneCount > 0) {
      console.log(
        `[PMXBoneSystem] Updated ${boneCount} bone matrices for entity ${boneComponent.data.assetId}`,
      );
    }
  }

  /**
   * Get bone statistics for debugging
   * @returns Bone system statistics
   */
  getStats(): {
    totalEntities: number;
    totalBones: number;
    activeBones: number;
  } {
    const entities = this.world.getEntitiesWithComponents([PMXBoneComponent]);
    let totalBones = 0;
    let activeBones = 0;

    for (const entity of entities) {
      const boneComponent = entity.getComponent(PMXBoneComponent.componentName) as PMXBoneComponent;
      if (boneComponent) {
        const boneCount = boneComponent.getBoneCount();
        totalBones += boneCount;

        // Count active bones (enabled transforms)
        for (let i = 0; i < boneCount; i++) {
          const transform = boneComponent.getBoneTransform(i);
          if (transform && transform.enabled) {
            activeBones++;
          }
        }
      }
    }

    return {
      totalEntities: entities.length,
      totalBones,
      activeBones,
    };
  }
}
