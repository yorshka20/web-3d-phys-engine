import {
  ActiveCameraTag,
  Camera3DComponent,
  CameraControlComponent,
  Mesh3DComponent,
  Transform3DComponent,
  Vec3,
  WebGPU3DRenderComponent,
  World,
} from '@ecs';
import { AnyMesh3DShapeDescriptor } from '@ecs/components/physics/mesh/types';
import { rgba } from '@ecs/utils/color';

export type SpawnableType = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule';

export interface SpawnConfig {
  type: SpawnableType;
  color: string;
  scale: number;
  metallic: number;
  roughness: number;
}

export const DEFAULT_SPAWN_CONFIG: SpawnConfig = {
  type: 'cube',
  color: '#ff6b6b',
  scale: 1,
  metallic: 0,
  roughness: 0.5,
};

function getActiveCamera(world: World) {
  const cameras = world.getEntitiesByCondition(
    (e) =>
      e.hasComponent(ActiveCameraTag.componentName) &&
      e.hasComponent(Camera3DComponent.componentName),
  );
  return cameras[0];
}

// Spawn position == orbit target (same point the CameraTargetIndicator sits at).
export function computeSpawnPosition(world: World): Vec3 {
  const camera = getActiveCamera(world);
  if (!camera) return [0, 1, 0];

  const control = camera.getComponent<CameraControlComponent>(
    CameraControlComponent.componentName,
  );
  const orbitTarget = control?.getOrbitConfig()?.target;
  if (orbitTarget) return [orbitTarget[0], orbitTarget[1], orbitTarget[2]];

  const cam = camera.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
  return cam ? [cam.target[0], cam.target[1], cam.target[2]] : [0, 1, 0];
}

let spawnCounter = 0;

export function spawnEntity(world: World, config: SpawnConfig) {
  const position = computeSpawnPosition(world);
  const entity = world.createEntity('object');
  entity.setLabel(`spawned_${config.type}_${++spawnCounter}`);

  const descriptor = { type: config.type, params: {} } as AnyMesh3DShapeDescriptor;
  entity.addComponent(world.createComponent(Mesh3DComponent, { descriptor }));
  entity.addComponent(
    world.createComponent(Transform3DComponent, {
      position,
      rotation: [0, 0, 0],
      scale: [config.scale, config.scale, config.scale],
    }),
  );
  entity.addComponent(
    world.createComponent(WebGPU3DRenderComponent, {
      material: {
        albedo: rgba(config.color),
        metallic: config.metallic,
        roughness: config.roughness,
        emissive: rgba('#000000'),
        emissiveIntensity: 0,
        materialType: 'normal' as const,
      },
    }),
  );

  world.addEntity(entity);
  return entity;
}
