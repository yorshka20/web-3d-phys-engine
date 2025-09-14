import { Mesh3DComponent, Transform3DComponent, WebGPU3DRenderComponent, World } from '@ecs';
import { GeometryInstanceDescriptor } from '@renderer';
import chroma from 'chroma-js';

export function createGeometryStage(world: World) {
  createGeometryEntities(world);
}

const defaultMaterial = {
  albedo: chroma('#000000'),
  metallic: 0,
  roughness: 0.5,
  emissive: chroma('#000000'),
  emissiveIntensity: 0,
  materialType: 'normal' as const,
};

function createGeometryEntities(world: World) {
  const geometries: GeometryInstanceDescriptor[] = [
    {
      type: 'cube',
      transform: {
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        scale: [0.5, 0.5, 0.5],
      },
      name: 'SmallCube',
    },
    {
      type: 'cube',
      transform: {
        position: [5, 0, 0],
        rotation: [0, Math.PI / 4, 0],
        scale: [2.0, 1.0, 1.0],
        rotationVelocity: [3 * Math.PI, 0, 0],
      },
      name: 'MediumCube',
    },
    {
      type: 'cylinder',
      transform: {
        position: [5, 0, 5],
        rotation: [Math.PI / 6, 0, Math.PI / 6],
        scale: [1.5, 1.5, 1.5],
        rotationVelocity: [0, 1, 0], // Rotate around Y axis at 1 radian per second
      },
      material: {
        ...defaultMaterial,
        normalTextureId: 'normal_texture',
      },
      name: 'Cylinder',
    },
    {
      type: 'sphere',
      transform: {
        position: [0, 5, 0],
        rotation: [Math.PI / 6, 0, Math.PI / 6],
        scale: [5, 5, 5],
      },
      name: 'Sphere',
      material: {
        ...defaultMaterial,
        alphaMode: 'blend',
        customShaderId: 'water_material_shader',
        albedoTextureId: 'water_texture',
        shaderParams: {
          waveFrequency: 0.15,
          waveSpeed: 1.2,
          waveAmplitude: 0.15,
          fresnelPower: 2.5,
          waterOpacity: 0.7,
        },
      },
    },
    {
      type: 'sphere',
      transform: {
        position: [8, 3, 0],
        rotation: [0, 0, 0],
        scale: [3, 5, 7],
        rotationVelocity: [0, 0.5, 0.5],
      },
      name: 'Sphere 2',
      material: {
        albedo: chroma('#00ff00'),
        metallic: 0,
        roughness: 0.5,
        emissive: chroma('#ff0000'),
        emissiveIntensity: 10,
        alphaMode: 'blend',
        customShaderId: 'fire_material_shader',
        albedoTextureId: 'water_texture', // Use same texture for now
        shaderParams: {
          flickerSpeed: 6.0,
          flickerIntensity: 0.15,
          fireOpacity: 0.95,
        },
        materialType: 'normal' as const,
      },
    },
  ];

  for (const geometry of geometries) {
    const entity = world.createEntity('object');
    entity.setLabel(geometry.name || '');

    entity.addComponent(
      world.createComponent(Mesh3DComponent, {
        descriptor: {
          type: geometry.type,
          params: geometry.params,
        },
      }),
    );
    entity.addComponent(
      world.createComponent(Transform3DComponent, {
        position: geometry.transform.position,
        rotation: geometry.transform.rotation,
        scale: geometry.transform.scale,
        rotationVelocity: geometry.transform.rotationVelocity,
      }),
    );
    entity.addComponent(
      world.createComponent(WebGPU3DRenderComponent, {
        material: geometry.material || defaultMaterial,
      }),
    );
    world.addEntity(entity);
  }
}
