import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { rgba } from '@ecs/utils/color';

import pelicaModel from '../../../assets/hgrp/pelica/pelica.glb?url';

// Stage A2 milestone: the converted HGRP character renders through the existing glTF/PBR
// path (baseColor only, bind pose). HGRP materials/shaders replace this in Stage B.
export async function createHGRPStage(world: World) {
  await AssetLoader.loadAssets([
    {
      type: 'gltf_model_url' as const,
      url: pelicaModel,
      assetId: 'hgrp_pelica',
      priority: 'normal' as const,
    },
  ]);

  const entity = world.createEntity('object');
  entity.setLabel('pelica');

  entity.addComponent(
    world.createComponent(Mesh3DComponent, {
      descriptor: { type: 'gltf', primitiveType: 'triangle-list', assetId: 'hgrp_pelica' },
    }),
  );

  // The asset stays in meters (character ≈ 1.67 tall); the scene works at PMX-character
  // scale (~15-20 units), so present at 10x. The rip's bind pose is offset from the origin
  // (raw vertex bounds center ≈ [-2.07, 1.52, 4.96], feet at y=0.69); the translation
  // compensates that offset scaled, centering the character at x/z=0 with feet on the
  // ground plane (y=-1).
  const scale = 10;
  entity.addComponent(
    world.createComponent(Transform3DComponent, {
      position: [2.07 * scale, -1 - 0.69 * scale, -4.96 * scale],
      rotation: [0, 0, 0],
      scale: [scale, scale, scale],
    }),
  );

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
}
