import { PMXMeshComponent, Transform3DComponent, Vec3, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import chroma from 'chroma-js';

import endministratorModel from '../../assets/endministrator/endministrator.pmx?url';
import nahidaModel from '../../assets/nahida/nahida.pmx?url';
import perlicaModel from '../../assets/perlica/perlica.pmx?url';

// Import PMX textures - endministrator
import endministratorTex9 from '../../assets/endministrator/textures/hair_s.png?url';
import endministratorTex7 from '../../assets/endministrator/textures/ls.png?url';
import endministratorTex3 from '../../assets/endministrator/textures/st-1g2.jpg?url';
import endministratorTex11 from '../../assets/endministrator/textures/T_actor_common_eyeshadow_01_M.png?url';
import endministratorTex12 from '../../assets/endministrator/textures/T_actor_common_hairshadow_01_M.png?url';
import endministratorTex1 from '../../assets/endministrator/textures/T_actor_endminf_body_01_D.png?url';
import endministratorTex2 from '../../assets/endministrator/textures/T_actor_endminf_cloth_01_D.png?url';
import endministratorTex5 from '../../assets/endministrator/textures/T_actor_endminf_cloth_03_D.png?url';
import endministratorTex6 from '../../assets/endministrator/textures/T_actor_endminf_face_01_D.png?url';
import endministratorTex8 from '../../assets/endministrator/textures/T_actor_endminf_hair_01_D.png?url';
import endministratorTex10 from '../../assets/endministrator/textures/T_actor_endminf_iris_01_D.png?url';
import endministratorTex4 from '../../assets/endministrator/textures/T_actor_pelica_cloth_02_D.png?url';

// Import PMX textures - nahida
import nahidaTex3 from '../../assets/nahida/hair.bmp?url';
import nahidaTex2 from '../../assets/nahida/skin.bmp?url';
import nahidaSph1 from '../../assets/nahida/sph/hair_s.bmp?url';
import nahidaTex8 from '../../assets/nahida/tex/spa_h.png?url';
import nahidaTex6 from '../../assets/nahida/tex/体1.png?url';
import nahidaTex7 from '../../assets/nahida/tex/肌.png?url';
import nahidaTex1 from '../../assets/nahida/tex/颜.png?url';
import nahidaTex4 from '../../assets/nahida/tex/髮1.png?url';
import nahidaTex5 from '../../assets/nahida/toon_defo.bmp?url';

// Import PMX textures - perlica
import perlicaTex1 from '../../assets/perlica/hair_s.png?url';
import perlicaTex2 from '../../assets/perlica/ls.png?url';
import perlicaTex3 from '../../assets/perlica/st-1g1.jpg?url';
import perlicaTex4 from '../../assets/perlica/textures/T_actor_pelica_body_01_D.png?url';
import perlicaTex5 from '../../assets/perlica/textures/T_actor_pelica_cloth_01_D.png?url';
import perlicaTex6 from '../../assets/perlica/textures/T_actor_pelica_cloth_02_D.png?url';
import perlicaTex7 from '../../assets/perlica/textures/T_actor_pelica_face_01_D.png?url';
import perlicaTex8 from '../../assets/perlica/textures/T_actor_pelica_hair_01_D.png?url';
import perlicaTex9 from '../../assets/perlica/textures/T_actor_pelica_iris_01_D.png?url';

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

  // Load PMX model and its textures
  await AssetLoader.loadPMXModelFromURL(endministratorModel, 'endministrator');
  await AssetLoader.loadPMXModelFromURL(nahidaModel, 'nahida');
  await AssetLoader.loadPMXModelFromURL(perlicaModel, 'perlica');

  // Load PMX textures based on actual PMX model texture list
  // Endministrator textures
  const endministratorTextures = [
    'textures\\T_actor_endminf_body_01_D.png',
    'textures\\T_actor_endminf_cloth_01_D.png',
    'textures\\st-1g2.jpg',
    'textures\\T_actor_pelica_cloth_02_D.png',
    'textures\\T_actor_endminf_cloth_03_D.png',
    'textures\\T_actor_endminf_face_01_D.png',
    'textures\\ls.png',
    'textures\\T_actor_endminf_hair_01_D.png',
    'textures\\hair_s.png',
    'textures\\T_actor_endminf_iris_01_D.png',
    'textures\\T_actor_common_eyeshadow_01_M.png',
    'textures\\T_actor_common_hairshadow_01_M.png',
  ];

  // Nahida textures
  const nahidaTextures = [
    'tex/颜.png',
    'skin.bmp',
    'hair.bmp',
    'tex/髮1.png',
    'toon_defo.bmp',
    'tex/体1.png',
    'tex/肌.png',
    'tex/spa_h.png',
    'sph\\hair_s.bmp',
  ];

  // Perlica textures
  const perlicaTextures = [
    'hair_s.png',
    'ls.png',
    'st-1g1.jpg',
    'textures\\T_actor_pelica_body_01_D.png',
    'textures\\T_actor_pelica_cloth_01_D.png',
    'textures\\T_actor_pelica_cloth_02_D.png',
    'textures\\T_actor_pelica_face_01_D.png',
    'textures\\T_actor_pelica_hair_01_D.png',
    'textures\\T_actor_pelica_iris_01_D.png',
  ];

  // Create separate texture maps for each model to avoid key conflicts
  const endministratorTextureMap = {
    'textures\\T_actor_endminf_body_01_D.png': endministratorTex1,
    'textures\\T_actor_endminf_cloth_01_D.png': endministratorTex2,
    'textures\\st-1g2.jpg': endministratorTex3,
    'textures\\T_actor_pelica_cloth_02_D.png': endministratorTex4,
    'textures\\T_actor_endminf_cloth_03_D.png': endministratorTex5,
    'textures\\T_actor_endminf_face_01_D.png': endministratorTex6,
    'textures\\ls.png': endministratorTex7,
    'textures\\T_actor_endminf_hair_01_D.png': endministratorTex8,
    'textures\\hair_s.png': endministratorTex9,
    'textures\\T_actor_endminf_iris_01_D.png': endministratorTex10,
    'textures\\T_actor_common_eyeshadow_01_M.png': endministratorTex11,
    'textures\\T_actor_common_hairshadow_01_M.png': endministratorTex12,
  };

  const nahidaTextureMap = {
    'tex/颜.png': nahidaTex1,
    'skin.bmp': nahidaTex2,
    'hair.bmp': nahidaTex3,
    'tex/髮1.png': nahidaTex4,
    'toon_defo.bmp': nahidaTex5,
    'tex/体1.png': nahidaTex6,
    'tex/肌.png': nahidaTex7,
    'tex/spa_h.png': nahidaTex8,
    'sph\\hair_s.bmp': nahidaSph1,
  };

  const perlicaTextureMap = {
    'hair_s.png': perlicaTex1,
    'ls.png': perlicaTex2,
    'st-1g1.jpg': perlicaTex3,
    'textures\\T_actor_pelica_body_01_D.png': perlicaTex4,
    'textures\\T_actor_pelica_cloth_01_D.png': perlicaTex5,
    'textures\\T_actor_pelica_cloth_02_D.png': perlicaTex6,
    'textures\\T_actor_pelica_face_01_D.png': perlicaTex7,
    'textures\\T_actor_pelica_hair_01_D.png': perlicaTex8,
    'textures\\T_actor_pelica_iris_01_D.png': perlicaTex9,
  };

  // Combine all texture maps
  const textureUrlMap = {
    ...endministratorTextureMap,
    ...nahidaTextureMap,
    ...perlicaTextureMap,
  };

  // Combine all texture lists
  const allTexturePaths = [...endministratorTextures, ...nahidaTextures, ...perlicaTextures];

  // Load all textures using the exact PMX texture paths as IDs
  for (const texturePath of allTexturePaths) {
    const textureUrl = textureUrlMap[texturePath];
    if (textureUrl) {
      await AssetLoader.loadTextureFromURL(textureUrl, texturePath);
    } else {
      console.warn(`[Main] Texture URL not found for path: ${texturePath}`);
    }
  }
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
