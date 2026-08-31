import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { rgba } from '@ecs/utils/color';

// Khronos sample models are fetched at runtime, not imported at build time, so builds and CI
// never depend on the gltf-samples checkout. The base URL comes from web-client/.env (pinned
// jsDelivr CDN; .env.development.local can point it at the local submodule via /@fs). WebIO
// resolves each model's relative .bin/texture references against this URL.
const sampleModelUrl = (path: string) => `${import.meta.env.VITE_GLTF_SAMPLES_BASE}/${path}`;

// One model per rendering feature class:
//   Box           — untextured indexed primitive (reused as the scale series)
//   Suzanne       — untextured smooth-shaded mesh
//   Duck          — single baseColor texture
//   DamagedHelmet — full PBR texture set (baseColor/normal/metallicRoughness/AO/emissive)
//   Fox           — skinned model, renders in bind pose
//   FlightHelmet  — hero asset: 95k tris, 6 meshes/materials, 2K PBR sets (its visor uses the
//                   optional KHR_materials_transmission — unsupported, so it renders opaque)
//
// SciFiHelmet (the other hero candidate) is excluded until the renderer supports 32-bit index
// buffers — its 70k-vertex mesh is corrupted by the uint16-only index path. See
// docs/gltf-sample-assets.md for the full sample-library capability map.
//
// AssetLoader reads raw mesh primitives and ignores glTF node transforms, so models render at
// raw vertex scale (Duck is ~154 units tall, Fox ~79). `scale` normalizes each to roughly 2
// units, and position.y is chosen so the scaled bounding-box bottom rests exactly on the
// ground plane (y = -1) — ground contact doubles as a translation×scale correctness check.
const placements = [
  // scale series at z = -4: the same unit cube at 0.5x / 1x / 2x
  {
    assetId: 'gltf_box',
    path: 'Box/glTF/Box.gltf',
    label: 'box_0.5x',
    position: [-5, -0.75, -4],
    scale: 0.5,
  },
  {
    assetId: 'gltf_box',
    path: 'Box/glTF/Box.gltf',
    label: 'box_1x',
    position: [0, -0.5, -4],
    scale: 1,
  },
  {
    assetId: 'gltf_box',
    path: 'Box/glTF/Box.gltf',
    label: 'box_2x',
    position: [5, 0, -4],
    scale: 2,
  },
  // representative row at z = 2
  {
    assetId: 'gltf_suzanne',
    path: 'Suzanne/glTF/Suzanne.gltf',
    label: 'suzanne',
    position: [-6, -0.03, 2],
    scale: 1,
  },
  {
    assetId: 'gltf_duck',
    path: 'Duck/glTF/Duck.gltf',
    label: 'duck',
    position: [-2, -1.13, 2],
    scale: 0.013,
  },
  // floats at y = 2 on purpose: verifies translation along y, not just the ground rows
  {
    assetId: 'gltf_damaged_helmet',
    path: 'DamagedHelmet/glTF/DamagedHelmet.gltf',
    label: 'damaged_helmet',
    position: [2, 2, 2],
    scale: 1,
  },
  {
    assetId: 'gltf_fox',
    path: 'Fox/glTF/Fox.gltf',
    label: 'fox',
    position: [6, -1, 2],
    scale: 0.025,
  },
  // hero row at z = 8 (nearest the camera): fidelity benchmark for renderer work
  {
    assetId: 'gltf_flight_helmet',
    path: 'FlightHelmet/glTF/FlightHelmet.gltf',
    label: 'flight_helmet',
    position: [0, -1, 8],
    scale: 3,
  },
];

export async function createGLTFStage(world: World) {
  // Each unique asset loads once, however many placements reference it.
  const assetPaths = new Map(placements.map((p) => [p.assetId, p.path]));
  await AssetLoader.loadAssets(
    [...assetPaths].map(([assetId, path]) => ({
      type: 'gltf_model_url' as const,
      url: sampleModelUrl(path),
      assetId,
      priority: 'normal' as const,
    })),
  );

  placements.forEach((model) => {
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
        scale: [model.scale, model.scale, model.scale],
      }),
    );

    // The gltf shader path renders each primitive's own glTF material; the scalar factors here
    // are inert placeholders — this component only routes materialType/customShaderId into the
    // semantic pipeline key.
    entity.addComponent(
      world.createComponent(WebGPU3DRenderComponent, {
        material: {
          albedo: rgba('#ffffff'),
          metallic: 0,
          roughness: 0.5,
          emissive: rgba('#000000'),
          emissiveIntensity: 0,
          customShaderId: 'gltf_material_shader',
          materialType: 'gltf' as const,
        },
      }),
    );

    world.addEntity(entity);
  });
}
