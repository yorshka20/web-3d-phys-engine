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
import { burniceDescriptor, perlicaDescriptor } from './descriptors';

// Import model URLs
import burniceModel from '../../assets/burnice/柏妮思.pmx?url';
import perlicaModel from '../../assets/perlica/perlica.pmx?url';

export async function createPMXAnimationExample(world: World) {
  // Create animation controller
  const animationController = new PMXAnimationController(world);

  world.addSystem(new PMXBoneSystem());
  world.addSystem(new PMXMorphSystem());
  world.addSystem(new PMXAnimationSystem());

  // Register asset descriptors
  //   pmxAssetRegistry.register(alenDescriptor);
  pmxAssetRegistry.register(burniceDescriptor);
  pmxAssetRegistry.register(perlicaDescriptor);

  // Load PMX models
  //   await AssetLoader.loadPMXModelFromURL(alenModel, 'alen');
  await AssetLoader.loadPMXModelFromURL(burniceModel, 'burnice');
  await AssetLoader.loadPMXModelFromURL(perlicaModel, 'perlica');

  // Create PMX entities
  const perlicaEntity = createPMXEntity(world, {
    name: 'perlica',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  // Create PMX entities
  //   const alenEntity = createPMXEntity(world, {
  //     name: 'alen',
  //     position: [-10, 0, 0],
  //     rotation: [0, 0, 0],
  //   });
  const burniceEntity = createPMXEntity(world, {
    name: 'burnice',
    position: [10, 0, 0],
    rotation: [0, 0, 0],
  });

  // Initialize animation components
  animationController.initializePMXAnimation(perlicaEntity);
  //   animationController.initializePMXAnimation(alenEntity);
  animationController.initializePMXAnimation(burniceEntity);

  // --- Start a simple morph animation loop for testing ALL morphs ---
  const entitiesToAnimate = [perlicaEntity, burniceEntity];
  world.addSystem(new SimpleAnimationDriver(entitiesToAnimate));
  // --- End of simple morph animation loop ---

  // Create animation presets
  // createAnimationPresets(animationController);

  // Start some example animations
  for (const id of [perlicaEntity.id]) {
    // startExampleAnimations(animationController, id);
  }

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
 * A simple animation driver system for testing purposes.
 * It cycles through all morphs of the given entities and animates their weights.
 */
class SimpleAnimationDriver extends System {
  private morphIndex = 0;
  private morphWeight = 0;
  private increasing = true;
  private entities: Entity[];
  private lastSwitchTime = 0;
  private timeSinceSwitch = 0;

  constructor(entities: Entity[]) {
    // Run before other animation systems
    super('SimpleAnimationDriver', SystemPriorities.ANIMATION - 1, 'render');
    this.entities = entities;
    this.lastSwitchTime = performance.now();
  }

  update(deltaTime: number): void {
    this.timeSinceSwitch += deltaTime * 1000;

    // Animate weight from 0 to 1 and back to 0 over 2 seconds
    if (this.increasing) {
      this.morphWeight += deltaTime * 1.0; // 1 second to go up
      if (this.morphWeight >= 1.0) {
        this.morphWeight = 1.0;
        this.increasing = false;
      }
    } else {
      this.morphWeight -= deltaTime * 1.0; // 1 second to go down
      if (this.morphWeight <= 0.0) {
        this.morphWeight = 0.0;
        this.increasing = true;
        this.morphIndex++; // Switch to the next morph
      }
    }

    for (const entity of this.entities) {
      const morphComponent = entity.getComponent(
        PMXMorphComponent.componentName,
      ) as PMXMorphComponent;
      if (!morphComponent) continue;

      const totalMorphs =
        morphComponent.data.vertexMorphs.size + morphComponent.data.boneMorphs.size;
      if (this.morphIndex >= totalMorphs) {
        this.morphIndex = 0;
      }

      // In each frame, clear all previous morph weights
      morphComponent.clearAllMorphs();

      // Set the weight for the current active morph.
      // This will be picked up by PMXMorphSystem for Type 2 morphs,
      // and directly by the renderer for Type 1 morphs.
      morphComponent.setMorphWeight(this.morphIndex, this.morphWeight);
    }
  }
}

function createAnimationPresets(controller: PMXAnimationController) {
  // Happy expression preset
  const happyPreset = controller.createMorphPreset('happy', {
    0: 0.8, // Smile
    1: 0.6, // Eye squint
    2: 0.3, // Cheek raise
  });

  // Sad expression preset
  const sadPreset = controller.createMorphPreset('sad', {
    3: 0.9, // Frown
    4: 0.7, // Eye droop
    5: 0.4, // Lower lip
  });

  // Surprised expression preset
  const surprisedPreset = controller.createMorphPreset('surprised', {
    6: 1.0, // Wide eyes
    7: 0.8, // Raised eyebrows
    8: 0.6, // Open mouth
  });

  // Wave pose preset
  const wavePreset = controller.createBonePreset('wave', {
    10: {
      // Right arm
      rotation: [0, 0, 1.2], // Wave motion
    },
    11: {
      // Right forearm
      rotation: [0, 0, 0.8],
    },
  });

  // Bow pose preset
  const bowPreset = controller.createBonePreset('bow', {
    0: {
      // Root bone
      rotation: [0.3, 0, 0], // Lean forward
    },
    1: {
      // Spine
      rotation: [0.2, 0, 0],
    },
  });

  // Add presets to controller
  controller.addPreset(happyPreset);
  controller.addPreset(sadPreset);
  controller.addPreset(surprisedPreset);
  controller.addPreset(wavePreset);
  controller.addPreset(bowPreset);
}

function startExampleAnimations(controller: PMXAnimationController, entityId: string) {
  // Apply different expressions to each character
  controller.applyPreset(entityId, 'happy', 1.0);

  // Add some bone poses
  controller.applyPreset(entityId, 'wave', 0.8);

  // Example: Blend between expressions over time
  let blendFactor = 0;
  const blendDirection = 1;

  setInterval(() => {
    blendFactor += blendDirection * 0.02;

    if (blendFactor >= 1.0) {
      blendFactor = 1.0;
      // Switch to sad expression
      controller.blendPresets(entityId, 'happy', 'sad', blendFactor);
    } else if (blendFactor <= 0.0) {
      blendFactor = 0.0;
      // Switch back to happy expression
      controller.blendPresets(entityId, 'sad', 'happy', 1.0 - blendFactor);
    } else {
      // Continue blending
      controller.blendPresets(entityId, 'happy', 'sad', blendFactor);
    }
  }, 50); // Update every 50ms

  // Example: Cycle through different poses
  const poses = ['wave', 'bow'];
  let currentPoseIndex = 0;

  setInterval(() => {
    const nextPoseIndex = (currentPoseIndex + 1) % poses.length;
    const currentPose = poses[currentPoseIndex];
    const nextPose = poses[nextPoseIndex];

    // Blend between poses
    controller.blendPresets(entityId, currentPose, nextPose, 1.0);

    currentPoseIndex = nextPoseIndex;
  }, 3000); // Change pose every 3 seconds

  console.log('[PMXAnimationExample] Started example animations');
}
