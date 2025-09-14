import { PMXMeshComponent, Transform3DComponent, Vec3, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { pmxAssetRegistry } from '@renderer/webGPU/core/PMXAssetRegistry';
import chroma from 'chroma-js';
import {
  alenDescriptor,
  burniceDescriptor,
  endministratorDescriptor,
  evelynDescriptor,
  janeDescriptor,
  nahidaDescriptor,
  perlicaDescriptor,
  vivianDescriptor,
  yaojiayinDescriptor,
} from './descriptors';

import alenModel from '../../assets/alen/艾莲.pmx?url';
import burniceModel from '../../assets/burnice/柏妮思.pmx?url';
import endministratorModel from '../../assets/endministrator/endministrator.pmx?url';
import evelynModel from '../../assets/evelyn/伊芙琳.pmx?url';
import janeModel from '../../assets/jane/简.pmx?url';
import nahidaModel from '../../assets/nahida/nahida.pmx?url';
import perlicaModel from '../../assets/perlica/perlica.pmx?url';
import vivianModel from '../../assets/vivian/薇薇安.pmx?url';
import yaojiayinModel from '../../assets/yaojiayin/耀嘉音.pmx?url';

export async function createZZZPMXModelStage(world: World) {
  // 第一排：前方
  createPMXEntity(world, { name: 'alen', position: [-15, 0, -15], rotation: [0, 0, 0] });
  createPMXEntity(world, { name: 'burnice', position: [0, 0, -15], rotation: [0, 0, 0] });
  createPMXEntity(world, { name: 'evelyn', position: [15, 0, -15], rotation: [0, 0, 0] });

  // 第二排：中间
  createPMXEntity(world, { name: 'jane', position: [-15, 0, 0], rotation: [0, 0, 0] });
  createPMXEntity(world, { name: 'vivian', position: [0, 0, 0], rotation: [0, 0, 0] });
  createPMXEntity(world, { name: 'yaojiayin', position: [15, 0, 0], rotation: [0, 0, 0] });

  // 第三排：后方
  createPMXEntity(world, { name: 'endministrator', position: [-15, 0, 15], rotation: [0, 0, 0] });
  createPMXEntity(world, { name: 'nahida', position: [0, 0, 15], rotation: [0, 0, 0] });
  createPMXEntity(world, { name: 'perlica', position: [15, 0, 15], rotation: [0, 0, 0] });

  // Register asset descriptors
  pmxAssetRegistry.register(alenDescriptor);
  pmxAssetRegistry.register(burniceDescriptor);
  pmxAssetRegistry.register(endministratorDescriptor);
  pmxAssetRegistry.register(evelynDescriptor);
  pmxAssetRegistry.register(janeDescriptor);
  pmxAssetRegistry.register(nahidaDescriptor);
  pmxAssetRegistry.register(perlicaDescriptor);
  pmxAssetRegistry.register(vivianDescriptor);
  pmxAssetRegistry.register(yaojiayinDescriptor);

  // Load PMX models (this will also load PMX-specified textures with namespace isolation)
  await AssetLoader.loadPMXModelFromURL(alenModel, 'alen');
  await AssetLoader.loadPMXModelFromURL(burniceModel, 'burnice');
  await AssetLoader.loadPMXModelFromURL(endministratorModel, 'endministrator');
  await AssetLoader.loadPMXModelFromURL(evelynModel, 'evelyn');
  await AssetLoader.loadPMXModelFromURL(janeModel, 'jane');
  await AssetLoader.loadPMXModelFromURL(nahidaModel, 'nahida');
  await AssetLoader.loadPMXModelFromURL(perlicaModel, 'perlica');
  await AssetLoader.loadPMXModelFromURL(vivianModel, 'vivian');
  await AssetLoader.loadPMXModelFromURL(yaojiayinModel, 'yaojiayin');
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
