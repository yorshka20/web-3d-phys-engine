import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { rgba } from '@ecs/utils/color';

// Khronos sample models are fetched at runtime, not imported at build time, so builds and CI
// never depend on the gltf-samples checkout. The base URL comes from web-client/.env (pinned
// jsDelivr CDN; .env.development.local can point it at the local submodule via /@fs). WebIO
// resolves each model's relative .bin/texture references against this URL.
const sampleModelUrl = (path: string) => `${import.meta.env.VITE_GLTF_SAMPLES_BASE}/${path}`;

export async function createGLTFStage(world: World) {
  // Load GLTF models into CPU asset registry
  await AssetLoader.loadAssets([
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Box/glTF/Box.gltf'),
      assetId: 'gltf_box',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Suzanne/glTF/Suzanne.gltf'),
      assetId: 'gltf_suzanne',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Triangle/glTF/Triangle.gltf'),
      assetId: 'gltf_triangle',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('SunglassesKhronos/glTF/SunglassesKhronos.gltf'),
      assetId: 'gltf_sunglasses',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('ToyCar/glTF/ToyCar.gltf'),
      assetId: 'gltf_toy_car',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('SciFiHelmet/glTF/SciFiHelmet.gltf'),
      assetId: 'gltf_sci_fi_helmet',
      priority: 'normal',
    },
    // Additional test models for comprehensive material and geometry coverage
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('DamagedHelmet/glTF/DamagedHelmet.gltf'),
      assetId: 'gltf_damaged_helmet',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('FlightHelmet/glTF/FlightHelmet.gltf'),
      assetId: 'gltf_flight_helmet',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('MetalRoughSpheres/glTF/MetalRoughSpheres.gltf'),
      assetId: 'gltf_metal_rough_spheres',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Fox/glTF/Fox.gltf'),
      assetId: 'gltf_fox',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Duck/glTF/Duck.gltf'),
      assetId: 'gltf_duck',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('BoomBox/glTF/BoomBox.gltf'),
      assetId: 'gltf_boom_box',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Lantern/glTF/Lantern.gltf'),
      assetId: 'gltf_lantern',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Avocado/glTF/Avocado.gltf'),
      assetId: 'gltf_avocado',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('CesiumMan/glTF/CesiumMan.gltf'),
      assetId: 'gltf_cesium_man',
      priority: 'normal',
    },
    {
      type: 'gltf_model_url',
      url: sampleModelUrl('Cube/glTF/Cube.gltf'),
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
        albedo: rgba('#ffffff'),
        metallic: 0,
        roughness: 0.5,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_suzanne',
      label: 'gltf_suzanne',
      position: [3, 0, 0],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#ff6b6b'),
        metallic: 0.2,
        roughness: 0.3,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_triangle',
      label: 'gltf_triangle',
      position: [-3, 0, 0],
      scale: [2, 2, 2],
      material: {
        albedo: rgba('#4ecdc4'),
        metallic: 0.8,
        roughness: 0.1,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_sunglasses',
      label: 'gltf_sunglasses',
      position: [0, 3, 0],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#2c3e50'),
        metallic: 0.9,
        roughness: 0.1,
        emissive: rgba('#000000'),
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
        albedo: rgba('#f39c12'),
        metallic: 0.1,
        roughness: 0.7,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_sci_fi_helmet',
      label: 'gltf_sci_fi_helmet',
      position: [0, 5, 5],
      scale: [3, 3, 3],
      material: {
        albedo: rgba('#9b59b6'),
        metallic: 0.7,
        roughness: 0.2,
        emissive: rgba('#8e44ad'),
        emissiveIntensity: 0.3,
      },
    },
    // Additional test models with evenly distributed layout
    {
      assetId: 'gltf_damaged_helmet',
      label: 'gltf_damaged_helmet',
      position: [5, 0, 0],
      scale: [1.2, 1.2, 1.2],
      material: {
        albedo: rgba('#8B4513'), // Brown metallic helmet
        metallic: 0.8,
        roughness: 0.3,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_flight_helmet',
      label: 'gltf_flight_helmet',
      position: [-5, 0, 0],
      scale: [1.2, 1.2, 1.2],
      material: {
        albedo: rgba('#2C3E50'), // Dark blue helmet
        metallic: 0.6,
        roughness: 0.2,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_metal_rough_spheres',
      label: 'gltf_metal_rough_spheres',
      position: [0, 5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#ffffff'),
        metallic: 0.5,
        roughness: 0.5,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_fox',
      label: 'gltf_fox',
      position: [0, -5, 0],
      scale: [0.8, 0.8, 0.8],
      material: {
        albedo: rgba('#FF8C00'), // Orange fox
        metallic: 0,
        roughness: 0.8,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_duck',
      label: 'gltf_duck',
      position: [0, 0, 5],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#FFD700'), // Golden duck
        metallic: 0.3,
        roughness: 0.4,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_boom_box',
      label: 'gltf_boom_box',
      position: [0, 0, -5],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#1A1A1A'), // Black boombox
        metallic: 0.2,
        roughness: 0.6,
        emissive: rgba('#FF0000'), // Red LED lights
        emissiveIntensity: 0.5,
      },
    },
    {
      assetId: 'gltf_lantern',
      label: 'gltf_lantern',
      position: [3.5, 3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#FFA500'), // Orange lantern
        metallic: 0.1,
        roughness: 0.3,
        emissive: rgba('#FFD700'), // Golden light
        emissiveIntensity: 0.8,
      },
    },
    {
      assetId: 'gltf_avocado',
      label: 'gltf_avocado',
      position: [-3.5, 3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#228B22'), // Green avocado
        metallic: 0,
        roughness: 0.9,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_cesium_man',
      label: 'gltf_cesium_man',
      position: [3.5, -3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#4169E1'), // Royal blue
        metallic: 0.1,
        roughness: 0.7,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
      },
    },
    {
      assetId: 'gltf_cube',
      label: 'gltf_cube',
      position: [-3.5, -3.5, 0],
      scale: [1, 1, 1],
      material: {
        albedo: rgba('#DC143C'), // Crimson cube
        metallic: 0.4,
        roughness: 0.2,
        emissive: rgba('#000000'),
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
