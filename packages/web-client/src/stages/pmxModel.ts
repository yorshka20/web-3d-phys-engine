import { PMXMeshComponent, Transform3DComponent, Vec3, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { pmxAssetRegistry } from '@renderer/webGPU/core/PMXAssetRegistry';
import chroma from 'chroma-js';
import { endministratorDescriptor, nahidaDescriptor, perlicaDescriptor } from './descriptors';

import endministratorModel from '../../assets/endministrator/endministrator.pmx?url';
import nahidaModel from '../../assets/nahida/nahida.pmx?url';
import perlicaModel from '../../assets/perlica/perlica.pmx?url';

export async function createPMXModelStage(world: World) {
  createPMXEntity(world, { name: 'endministrator', position: [0, 0, -10], rotation: [0, 0, 0] });
  createPMXEntity(world, {
    name: 'nahida',
    position: [10, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
  });
  createPMXEntity(world, {
    name: 'perlica',
    position: [0, 0, 10],
    rotation: [0, Math.PI / 2, 0],
  });

  // Register asset descriptors
  pmxAssetRegistry.register(endministratorDescriptor);
  pmxAssetRegistry.register(nahidaDescriptor);
  pmxAssetRegistry.register(perlicaDescriptor);

  // Load PMX models (this will also load PMX-specified textures with namespace isolation)
  await AssetLoader.loadPMXModelFromURL(endministratorModel, 'endministrator');
  await AssetLoader.loadPMXModelFromURL(nahidaModel, 'nahida');
  await AssetLoader.loadPMXModelFromURL(perlicaModel, 'perlica');
}

interface PMXModel {
  name: string;
  position: Vec3;
  rotation: Vec3;
}

function createPMXEntity(world: World, pmxModel: PMXModel) {
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
        albedo: chroma('#000000'),
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
