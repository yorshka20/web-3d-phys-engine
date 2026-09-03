import { PMXMeshComponent, Transform3DComponent, Vec3, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import { pmxAssetRegistry } from '@renderer/webGPU/core/PMXAssetRegistry';
import { siDescriptor } from './descriptors/si';
import { zhuangfangyiDescriptor } from './descriptors/zhuangfangyi';

import siModel from '../../../assets/si/祀.pmx?url';
import zhuangfangyiModel from '../../../assets/zhuangfangyi/庄方宜.pmx?url';

export async function createEndfieldStage(world: World) {
  createPMXEntity(world, { name: 'si', position: [-8, 0, 0], rotation: [0, 0, 0] });
  createPMXEntity(world, { name: 'zhuangfangyi', position: [8, 0, 0], rotation: [0, 0, 0] });

  // Register asset descriptors
  pmxAssetRegistry.register(siDescriptor);
  pmxAssetRegistry.register(zhuangfangyiDescriptor);

  // Load PMX models (this will also load PMX-specified textures with namespace isolation)
  await AssetLoader.loadPMXModelFromURL(siModel, 'si');
  await AssetLoader.loadPMXModelFromURL(zhuangfangyiModel, 'zhuangfangyi');
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
  entity.addComponent(world.createComponent(WebGPU3DRenderComponent, {}));

  world.addEntity(entity);
  return entity;
}
