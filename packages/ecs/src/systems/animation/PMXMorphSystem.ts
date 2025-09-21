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
import { Vec3, Vec4 } from '@ecs/types/types';
import { quat } from 'gl-matrix';

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
    const accumulatedOffsets = new Map<number, { position: Vec3; rotation: Vec4 }>();

    for (const morphState of activeBoneMorphs) {
      if (morphState.weight <= 0) continue;

      const boneMorphData = morphComponent.getBoneMorphData(morphState.morphIndex);
      if (!boneMorphData) {
        console.log(`[PMXMorphSystem] Morph ${morphState.morphIndex} not found in boneMorphs!`);
        continue;
      }

      // Accumulate offsets for each bone affected by this morph
      for (const morphData of boneMorphData) {
        if (!accumulatedOffsets.has(morphData.boneIndex)) {
          accumulatedOffsets.set(morphData.boneIndex, {
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1], // Identity quaternion
          });
        }

        const acc = accumulatedOffsets.get(morphData.boneIndex)!;
        const weight = morphState.weight;

        // Position data is already transformed in AssetLoader, no need to flip Z-axis again
        // Apply position offset with reasonable scaling
        acc.position[0] += morphData.translation[0] * weight;
        acc.position[1] += morphData.translation[1] * weight;
        acc.position[2] += morphData.translation[2] * weight;

        // Handle rotation - accumulate quaternions properly
        // Don't scale quaternions directly, use slerp for proper interpolation
        const morphQuat = quat.fromValues(
          morphData.rotation[0],
          morphData.rotation[1],
          morphData.rotation[2],
          morphData.rotation[3],
        );

        // Normalize the morph quaternion
        quat.normalize(morphQuat, morphQuat);

        // Use slerp to interpolate between identity and morph quaternion based on weight
        const identityQuat = quat.create();
        const interpolatedQuat = quat.create();
        quat.slerp(interpolatedQuat, identityQuat, morphQuat, weight);

        // Get current accumulated rotation
        const currentQuat = quat.fromValues(
          acc.rotation[0],
          acc.rotation[1],
          acc.rotation[2],
          acc.rotation[3],
        );

        // Multiply quaternions to combine rotations
        const resultQuat = quat.create();
        quat.multiply(resultQuat, currentQuat, interpolatedQuat);

        acc.rotation[0] = resultQuat[0];
        acc.rotation[1] = resultQuat[1];
        acc.rotation[2] = resultQuat[2];
        acc.rotation[3] = resultQuat[3];
      }
    }

    // Apply accumulated offsets to bones
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
