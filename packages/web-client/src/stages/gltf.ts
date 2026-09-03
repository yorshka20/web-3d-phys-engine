import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { rgba } from '@ecs/utils/color';
import { registerDebugTab } from '../ui/debugPanel';
import { createSpawnTab } from '../ui/spawnTab';

// Khronos sample models are fetched at runtime, not imported at build time, so builds and CI
// never depend on the gltf-samples checkout. The base URL comes from web-client/.env (pinned
// jsDelivr CDN; .env.development.local can point it at the local submodule via /@fs). WebIO
// resolves each model's relative .bin/texture references against this URL.
const sampleModelUrl = (path: string) => `${import.meta.env.VITE_GLTF_SAMPLES_BASE}/${path}`;

// One model per rendering feature class:
//   Box           — untextured indexed primitive (reused as the scale series)
//   Suzanne       — untextured smooth-shaded mesh
//   Duck          — single baseColor texture; node-transform test (0.01 scene-node scale)
//   DamagedHelmet — full PBR texture set (baseColor/normal/metallicRoughness/AO/emissive);
//                   node-rotation test (+90° X must match the reference orientation)
//   Fox           — skinned model, renders in bind pose
//   SciFiHelmet   — 70k-vertex single mesh with uint32 indices (index-width regression)
//   FlightHelmet  — hero asset: 95k tris, 6 meshes/materials, 2K PBR sets (its visor uses the
//                   optional KHR_materials_transmission — unsupported, so it renders opaque)
//
// glTF node transforms are baked into per-instance world matrices at load time, so placements
// use each asset's natural scale. Fox is the exception: a skinned mesh ignores its node
// transform (glTF 2.0 §3.7.3.2) and the model is authored at cm scale, so an entity-level
// 0.025 keeps it in scene proportion. position.y puts each bounding-box bottom exactly on the
// ground plane (y = -1) — ground contact doubles as a translation×scale correctness check.
// See docs/gltf-sample-assets.md for the full sample-library capability map.
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
    position: [-6, -0.025, 2],
    scale: 1,
  },
  // raw vertices are ~154 units tall; the scene node's 0.01 matrix must bring it to ~1.54
  {
    assetId: 'gltf_duck',
    path: 'Duck/glTF/Duck.gltf',
    label: 'duck',
    position: [-2, -1.1, 2],
    scale: 1,
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
    assetId: 'gltf_scifi_helmet',
    path: 'SciFiHelmet/glTF/SciFiHelmet.gltf',
    label: 'scifi_helmet',
    position: [-6, 0.46, 8],
    scale: 1,
  },
  {
    assetId: 'gltf_flight_helmet',
    path: 'FlightHelmet/glTF/FlightHelmet.gltf',
    label: 'flight_helmet',
    position: [0, -1, 8],
    scale: 3,
  },
];

export async function createGLTFStage(world: World) {
  registerDebugTab(createSpawnTab(world));

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
