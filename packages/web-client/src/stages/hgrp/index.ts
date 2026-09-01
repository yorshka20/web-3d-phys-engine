import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { HGRPPreset } from '@renderer/material/hgrp';
import { rgba } from '@ecs/utils/color';

import pelicaModel from '../../../assets/hgrp/pelica/pelica.glb?url';
import pelicaPreset from '../../../assets/hgrp/pelica/preset.json';

// Every texture in the character folder, keyed by filename; the loader registers the ones
// the preset references. eager+url keeps them as served URLs, not inlined data.
const pelicaTextureUrls = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../assets/hgrp/pelica/textures/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path.split('/').pop()!, url as string]),
);

export const HGRP_PELICA_ASSET_ID = 'hgrp_pelica';

// Stage B: the converted HGRP character renders through the HGRP material family — materials
// joined from preset.json by glb material name, BaseMap + DiffRamp lighting (M2). Variant
// features (SDF/matcap/rim, outline/stencil, tonemap) land in Stages C–E.
export async function createHGRPStage(world: World) {
  await AssetLoader.loadHGRPCharacter({
    url: pelicaModel,
    assetId: HGRP_PELICA_ASSET_ID,
    preset: pelicaPreset as HGRPPreset,
    textureUrls: pelicaTextureUrls,
  });

  const entity = world.createEntity('object');
  entity.setLabel('pelica');

  entity.addComponent(
    world.createComponent(Mesh3DComponent, {
      descriptor: { type: 'gltf', primitiveType: 'triangle-list', assetId: HGRP_PELICA_ASSET_ID },
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

  // Component material is only the fallback for primitives without a document material;
  // every pelica primitive carries an HGRP material joined at load time.
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
