import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import chroma from 'chroma-js';

// Import glTF models using Vite's import syntax
import boxGltf from '../../../gltf-samples/Models/Box/glTF/Box.gltf?url';
import sciFiHelmetGltf from '../../../gltf-samples/Models/SciFiHelmet/glTF/SciFiHelmet.gltf?url';
import sunglassesGltf from '../../../gltf-samples/Models/SunglassesKhronos/glTF/SunglassesKhronos.gltf?url';
import suzanneGltf from '../../../gltf-samples/Models/Suzanne/glTF/Suzanne.gltf?url';
import toyCarGltf from '../../../gltf-samples/Models/ToyCar/glTF/ToyCar.gltf?url';
import triangleGltf from '../../../gltf-samples/Models/Triangle/glTF/Triangle.gltf?url';

export async function createGLTFStage(world: World) {
  // Load GLTF models into CPU asset registry
  await AssetLoader.loadAssets([
    {
      type: 'gltf_model_url',
      url: boxGltf,
      assetId: 'gltf_box',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: suzanneGltf,
      assetId: 'gltf_suzanne',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: triangleGltf,
      assetId: 'gltf_triangle',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sunglassesGltf,
      assetId: 'gltf_sunglasses',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: toyCarGltf,
      assetId: 'gltf_toy_car',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sciFiHelmetGltf,
      assetId: 'gltf_sci_fi_helmet',
      priority: 'normal',
    },
  ]);

  // Create entities for each GLTF model with different positions and materials
  const models = [
    {
      assetId: 'gltf_box',
      label: 'gltf_box',
      position: [0, 0, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#ffffff'),
        metallic: 0,
        roughness: 0.5,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_suzanne',
      label: 'gltf_suzanne',
      position: [3, 0, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#ff6b6b'),
        metallic: 0.2,
        roughness: 0.3,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_triangle',
      label: 'gltf_triangle',
      position: [-3, 0, 0],
      scale: [2, 2, 2],
      material: {
        albedo: chroma('#4ecdc4'),
        metallic: 0.8,
        roughness: 0.1,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_sunglasses',
      label: 'gltf_sunglasses',
      position: [0, 3, 0],
      scale: [0.5, 0.5, 0.5],
      material: {
        albedo: chroma('#2c3e50'),
        metallic: 0.9,
        roughness: 0.1,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_toy_car',
      label: 'gltf_toy_car',
      position: [0, -3, 0],
      scale: [0.8, 0.8, 0.8],
      material: {
        albedo: chroma('#f39c12'),
        metallic: 0.1,
        roughness: 0.7,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_sci_fi_helmet',
      label: 'gltf_sci_fi_helmet',
      position: [0, 0, 3],
      scale: [1.2, 1.2, 1.2],
      material: {
        albedo: chroma('#9b59b6'),
        metallic: 0.7,
        roughness: 0.2,
        emissive: chroma('#8e44ad'),
        emissiveIntensity: 0.3,
      },
    },
  ];

  // Create entities for each model
  models.forEach((model) => {
    const entity = world.createEntity('object');
    entity.setLabel(model.label);

    entity.addComponent(
      world.createComponent(Mesh3DComponent, {
        descriptor: { type: 'gltf', primitiveType: 'triangle-list', assetId: model.assetId },
      }),
    );

    entity.addComponent(
      world.createComponent(Transform3DComponent, {
        position: model.position,
        rotation: [0, 0, 0],
        scale: model.scale,
      }),
    );

    entity.addComponent(
      world.createComponent(WebGPU3DRenderComponent, {
        material: {
          ...model.material,
          customShaderId: 'gltf_material_shader',
          materialType: 'gltf',
        },
      }),
    );

    world.addEntity(entity);
  });
}
