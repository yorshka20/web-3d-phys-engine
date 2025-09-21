/**
 * PMX Animation Example - Demonstrates how to use PMX morph and bone animation
 * This example shows how to create animated PMX models with facial expressions and poses
 */

import {
  PMXAnimationSystem,
  PMXBoneSystem,
  PMXMeshComponent,
  PMXMorphComponent,
  PMXMorphSystem,
  System,
  SystemPriorities,
  Transform3DComponent,
  Vec3,
  WebGPU3DRenderComponent,
} from '@ecs';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { PMXAnimationController } from '@ecs/systems/animation/PMXAnimationController';
import { AssetLoader } from '@renderer';
import { pmxAssetRegistry } from '@renderer/webGPU/core/PMXAssetRegistry';
import chroma from 'chroma-js';
import { alenDescriptor, burniceDescriptor, perlicaDescriptor } from './descriptors';

// Import model URLs
import alenModel from '../../assets/alen/艾莲.pmx?url';
import burniceModel from '../../assets/burnice/柏妮思.pmx?url';
import perlicaModel from '../../assets/perlica/perlica.pmx?url';

export async function createPMXAnimationExample(world: World) {
  // Create animation controller
  const animationController = new PMXAnimationController(world);

  world.addSystem(new PMXBoneSystem());
  world.addSystem(new PMXMorphSystem());
  world.addSystem(new PMXAnimationSystem());

  // Register asset descriptors
  pmxAssetRegistry.register(alenDescriptor);
  pmxAssetRegistry.register(burniceDescriptor);
  pmxAssetRegistry.register(perlicaDescriptor);

  // Load PMX models
  await AssetLoader.loadPMXModelFromURL(alenModel, 'alen');
  await AssetLoader.loadPMXModelFromURL(burniceModel, 'burnice');
  await AssetLoader.loadPMXModelFromURL(perlicaModel, 'perlica');

  // Create PMX entities
  const perlicaEntity = createPMXEntity(world, {
    name: 'perlica',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  // Create PMX entities
  const alenEntity = createPMXEntity(world, {
    name: 'alen',
    position: [-10, 0, 0],
    rotation: [0, 0, 0],
  });
  const burniceEntity = createPMXEntity(world, {
    name: 'burnice',
    position: [10, 0, 0],
    rotation: [0, 0, 0],
  });

  // Initialize animation components
  animationController.initializePMXAnimation(perlicaEntity);
  animationController.initializePMXAnimation(alenEntity);
  animationController.initializePMXAnimation(burniceEntity);

  // --- Start a simple morph animation loop for testing Type 2 morphs ---
  const entitiesToAnimate = world.getEntitiesByCondition((entity) =>
    entity.hasComponent(PMXMeshComponent.componentName),
  );
  world.addSystem(new Type2MorphAnimationDriver(entitiesToAnimate));
  // --- End of simple morph animation loop ---

  return animationController;
}

function createPMXEntity(world: World, pmxModel: { name: string; position: Vec3; rotation: Vec3 }) {
  const entity = world.createEntity('object');
  entity.setLabel('pmx');

  entity.addComponent(world.createComponent(PMXMeshComponent, pmxModel.name));
  entity.addComponent(
    world.createComponent(Transform3DComponent, {
      position: pmxModel.position,
      rotation: pmxModel.rotation,
    }),
  );
  entity.addComponent(
    world.createComponent(WebGPU3DRenderComponent, {
      material: {
        albedo: chroma('#ffffff'),
        metallic: 0,
        roughness: 0.5,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
        customShaderId: 'pmx_material_shader',
        materialType: 'pmx' as const,
      },
    }),
  );

  world.addEntity(entity);
  return entity;
}

/**
 * Type 2 morph animation driver system for testing bone morphs specifically.
 * It cycles through all Type 2 (bone) morphs and animates their weights.
 */
class Type2MorphAnimationDriver extends System {
  private morphWeight = 0;
  private increasing = true;
  private entities: Entity[];
  private lastSwitchTime = 0;
  private timeSinceSwitch = 0;
  private morphSwitchInterval = 3000; // Switch morph every 3 seconds
  private entityMorphIndices: Map<string, number> = new Map(); // entityId -> morphIndex

  constructor(entities: Entity[]) {
    // Run before other animation systems
    super('Type2MorphAnimationDriver', SystemPriorities.ANIMATION - 1, 'render');
    this.entities = entities;
    this.lastSwitchTime = performance.now();
  }

  update(deltaTime: number): void {
    // Animate weight from 0 to 1 and back to 0 over 4 seconds total
    if (this.increasing) {
      this.morphWeight += deltaTime * 0.5; // 2 seconds to reach 1.0
      if (this.morphWeight >= 1.0) {
        this.morphWeight = 1.0;
        this.increasing = false;
      }
    } else {
      this.morphWeight -= deltaTime * 0.5; // 2 seconds to go back to 0.0
      if (this.morphWeight <= 0.0) {
        this.morphWeight = 0.0;
        this.increasing = true;
      }
    }

    for (const entity of this.entities) {
      const morphComponent = entity.getComponent<PMXMorphComponent>(
        PMXMorphComponent.componentName,
      );
      if (!morphComponent) continue;

      // Only process Type 2 (bone) morphs
      const totalMorphs = morphComponent.data.boneMorphs.size;
      const morphIndices = Array.from(morphComponent.data.boneMorphs.keys());

      if (totalMorphs === 0) {
        continue;
      }

      // Get or initialize morph index for this entity
      let morphIndex = this.entityMorphIndices.get(entity.id) || 0;

      // Switch to next morph when weight reaches 0 and is increasing
      if (this.morphWeight === 0.0 && this.increasing) {
        morphIndex++;
        if (morphIndex >= totalMorphs) {
          morphIndex = 0;
        }
        this.entityMorphIndices.set(entity.id, morphIndex);
      }

      const actualMorphIndex = morphIndices[morphIndex];

      // In each frame, clear all previous morph weights
      morphComponent.clearAllMorphs();

      // Set the weight for the current active bone morph
      morphComponent.setMorphWeight(actualMorphIndex, this.morphWeight);

      // Log morph switch when starting a new morph
      if (this.morphWeight === 0.0 && this.increasing) {
        const morphData = morphComponent.getMorphData(actualMorphIndex);
        const morphName = morphData ? morphData.name : `Morph ${actualMorphIndex}`;
        console.log(
          `[Type2MorphAnimationDriver] Starting bone morph "${morphName}" (${morphIndex + 1}/${totalMorphs})`,
        );

        // Debug: Check if this morph has bone data
        const boneMorphData = morphComponent.getBoneMorphData(actualMorphIndex);
        if (boneMorphData) {
          console.log(`  - Bone morph data: ${boneMorphData.length} bone elements`);
        } else {
          console.log(`  - No bone morph data found for morph ${actualMorphIndex}`);
        }
      }
    }
  }
}
