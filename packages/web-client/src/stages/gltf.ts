import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import chroma from 'chroma-js';

// Import glTF model using Vite's import syntax
import boxGltf from '../../../gltf-samples/Models/Box/glTF/Box.gltf?url';

export async function createGLTFStage(world: World) {
  // Load GLTF model into CPU asset registry
  await AssetLoader.loadAssets([
    {
      type: 'gltf_model_url',
      url: boxGltf,
      assetId: 'gltf_box',
      priority: 'normal',
    },
  ]);

  // Create one entity to render the first primitive later via the renderer pipeline
  const entity = world.createEntity('object');
  entity.setLabel('gltf_box');

  entity.addComponent(
    world.createComponent(Mesh3DComponent, {
      descriptor: { type: 'gltf', primitiveType: 'triangle-list', assetId: 'gltf_box' },
    }),
  );

  entity.addComponent(
    world.createComponent(Transform3DComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
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
        customShaderId: 'gltf_material_shader',
        // A dedicated glTF material shader can be wired later; using default
        materialType: 'gltf',
      },
      // Note: The renderer system is expected to look up 'gltf_box' geometry from AssetRegistry
    }),
  );

  world.addEntity(entity);
}
