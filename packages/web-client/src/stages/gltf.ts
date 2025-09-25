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

import perlicaGltf from '../../assets/perlica_patron/perlica.glb?url';
import yvonneGltf from '../../assets/yvonne/yvonne.glb?url';

// Import additional glTF models for comprehensive testing
import avocadoGltf from '../../../gltf-samples/Models/Avocado/glTF/Avocado.gltf?url';
import boomBoxGltf from '../../../gltf-samples/Models/BoomBox/glTF/BoomBox.gltf?url';
import cesiumManGltf from '../../../gltf-samples/Models/CesiumMan/glTF/CesiumMan.gltf?url';
import cubeGltf from '../../../gltf-samples/Models/Cube/glTF/Cube.gltf?url';
import damagedHelmetGltf from '../../../gltf-samples/Models/DamagedHelmet/glTF/DamagedHelmet.gltf?url';
import duckGltf from '../../../gltf-samples/Models/Duck/glTF/Duck.gltf?url';
import flightHelmetGltf from '../../../gltf-samples/Models/FlightHelmet/glTF/FlightHelmet.gltf?url';
import foxGltf from '../../../gltf-samples/Models/Fox/glTF/Fox.gltf?url';
import lanternGltf from '../../../gltf-samples/Models/Lantern/glTF/Lantern.gltf?url';
import metalRoughSpheresGltf from '../../../gltf-samples/Models/MetalRoughSpheres/glTF/MetalRoughSpheres.gltf?url';

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
    {
      type: 'gltf_model_url',
      url: perlicaGltf,
      assetId: 'gltf_perlica',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: yvonneGltf,
      assetId: 'gltf_yvonne',
      priority: 'normal',
    },
    // Additional test models for comprehensive material and geometry coverage
    {
      type: 'gltf_model_url',
      url: damagedHelmetGltf,
      assetId: 'gltf_damaged_helmet',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: flightHelmetGltf,
      assetId: 'gltf_flight_helmet',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: metalRoughSpheresGltf,
      assetId: 'gltf_metal_rough_spheres',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: foxGltf,
      assetId: 'gltf_fox',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: duckGltf,
      assetId: 'gltf_duck',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: boomBoxGltf,
      assetId: 'gltf_boom_box',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: lanternGltf,
      assetId: 'gltf_lantern',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: avocadoGltf,
      assetId: 'gltf_avocado',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: cesiumManGltf,
      assetId: 'gltf_cesium_man',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: cubeGltf,
      assetId: 'gltf_cube',
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
      scale: [1, 1, 1],
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
      position: [0, -10, 0],
      scale: [1, 1, 1],
      rotation: [0, Math.PI / 2, Math.PI / 2],
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
      position: [0, 5, 5],
      scale: [3, 3, 3],
      material: {
        albedo: chroma('#9b59b6'),
        metallic: 0.7,
        roughness: 0.2,
        emissive: chroma('#8e44ad'),
        emissiveIntensity: 0.3,
      },
    },
    {
      assetId: 'gltf_perlica',
      label: 'gltf_perlica',
      position: [0, 0, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#000000'),
        metallic: 0,
        roughness: 0.5,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_yvonne',
      label: 'gltf_yvonne',
      position: [4, 4, 4],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#000000'),
        metallic: 0,
        roughness: 0.5,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    // Additional test models with evenly distributed layout
    {
      assetId: 'gltf_damaged_helmet',
      label: 'gltf_damaged_helmet',
      position: [5, 0, 0],
      scale: [1.2, 1.2, 1.2],
      material: {
        albedo: chroma('#8B4513'), // Brown metallic helmet
        metallic: 0.8,
        roughness: 0.3,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_flight_helmet',
      label: 'gltf_flight_helmet',
      position: [-5, 0, 0],
      scale: [1.2, 1.2, 1.2],
      material: {
        albedo: chroma('#2C3E50'), // Dark blue helmet
        metallic: 0.6,
        roughness: 0.2,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_metal_rough_spheres',
      label: 'gltf_metal_rough_spheres',
      position: [0, 5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#ffffff'),
        metallic: 0.5,
        roughness: 0.5,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_fox',
      label: 'gltf_fox',
      position: [0, -5, 0],
      scale: [0.8, 0.8, 0.8],
      material: {
        albedo: chroma('#FF8C00'), // Orange fox
        metallic: 0,
        roughness: 0.8,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_duck',
      label: 'gltf_duck',
      position: [0, 0, 5],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#FFD700'), // Golden duck
        metallic: 0.3,
        roughness: 0.4,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_boom_box',
      label: 'gltf_boom_box',
      position: [0, 0, -5],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#1A1A1A'), // Black boombox
        metallic: 0.2,
        roughness: 0.6,
        emissive: chroma('#FF0000'), // Red LED lights
        emissiveIntensity: 0.5,
      },
    },
    {
      assetId: 'gltf_lantern',
      label: 'gltf_lantern',
      position: [3.5, 3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#FFA500'), // Orange lantern
        metallic: 0.1,
        roughness: 0.3,
        emissive: chroma('#FFD700'), // Golden light
        emissiveIntensity: 0.8,
      },
    },
    {
      assetId: 'gltf_avocado',
      label: 'gltf_avocado',
      position: [-3.5, 3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#228B22'), // Green avocado
        metallic: 0,
        roughness: 0.9,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_cesium_man',
      label: 'gltf_cesium_man',
      position: [3.5, -3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#4169E1'), // Royal blue
        metallic: 0.1,
        roughness: 0.7,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_cube',
      label: 'gltf_cube',
      position: [-3.5, -3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: chroma('#DC143C'), // Crimson cube
        metallic: 0.4,
        roughness: 0.2,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
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
        rotation: model.rotation || [0, 0, 0],
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
