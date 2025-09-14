import { PMXMeshComponent, Transform3DComponent, Vec3, WebGPU3DRenderComponent } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { AssetLoader } from '@renderer';
import chroma from 'chroma-js';

import endministratorModel from '../../assets/endministrator/endministrator.pmx?url';
import nahidaModel from '../../assets/nahida/nahida.pmx?url';
import perlicaModel from '../../assets/perlica/perlica.pmx?url';

// Import PMX textures - endministrator
import endministratorTex1 from '../../assets/endministrator/textures/hair_s.png?url';
import endministratorTex2 from '../../assets/endministrator/textures/ls.png?url';
import endministratorTex3 from '../../assets/endministrator/textures/st-1g2.jpg?url';
import endministratorTex4 from '../../assets/endministrator/textures/T_actor_common_cloth_01_RD.png?url';
import endministratorTex5 from '../../assets/endministrator/textures/T_actor_common_eyeshadow_01_M.png?url';
import endministratorTex6 from '../../assets/endministrator/textures/T_actor_common_face_01_RD.png?url';
import endministratorTex7 from '../../assets/endministrator/textures/T_actor_common_female_face_01_cm_M.png?url';
import endministratorTex8 from '../../assets/endministrator/textures/T_actor_common_female_face_01_SDF.png?url';
import endministratorTex9 from '../../assets/endministrator/textures/T_actor_common_female_face_01_ST.png?url';
import endministratorTex10 from '../../assets/endministrator/textures/T_actor_common_hair_01_RD.png?url';
import endministratorTex11 from '../../assets/endministrator/textures/T_actor_common_hairline_01_M.png?url';
import endministratorTex12 from '../../assets/endministrator/textures/T_actor_common_hairshadow_01_M.png?url';
import endministratorTex13 from '../../assets/endministrator/textures/T_actor_common_hairst_01_ST.png?url';
import endministratorTex14 from '../../assets/endministrator/textures/T_actor_common_hatch_atlas_01_M.png?url';
import endministratorTex15 from '../../assets/endministrator/textures/T_actor_common_matcap_04_D.png?url';
import endministratorTex16 from '../../assets/endministrator/textures/T_actor_endminf_body_01_D.png?url';
import endministratorTex17 from '../../assets/endministrator/textures/T_actor_endminf_body_01_N.png?url';
import endministratorTex18 from '../../assets/endministrator/textures/T_actor_endminf_cloth_01_D.png?url';
import endministratorTex19 from '../../assets/endministrator/textures/T_actor_endminf_cloth_01_N.png?url';
import endministratorTex20 from '../../assets/endministrator/textures/T_actor_endminf_cloth_01_P.png?url';
import endministratorTex21 from '../../assets/endministrator/textures/T_actor_endminf_cloth_03_D.png?url';
import endministratorTex22 from '../../assets/endministrator/textures/T_actor_endminf_cloth_03_M.png?url';
import endministratorTex23 from '../../assets/endministrator/textures/T_actor_endminf_cloth_03_N.png?url';
import endministratorTex24 from '../../assets/endministrator/textures/T_actor_endminf_cloth_03_P.png?url';
import endministratorTex25 from '../../assets/endministrator/textures/T_actor_endminf_face_01_D.png?url';
import endministratorTex26 from '../../assets/endministrator/textures/T_actor_endminf_hair_01_D.png?url';
import endministratorTex27 from '../../assets/endministrator/textures/T_actor_endminf_hair_01_N.png?url';
import endministratorTex28 from '../../assets/endministrator/textures/T_actor_endminf_hair_01_P.png?url';
import endministratorTex29 from '../../assets/endministrator/textures/T_actor_endminf_hair_01_ST.png?url';
import endministratorTex30 from '../../assets/endministrator/textures/T_actor_endminf_hair_01_sw_M.png?url';
import endministratorTex31 from '../../assets/endministrator/textures/T_actor_endminf_iris_01_D.png?url';
import endministratorTex32 from '../../assets/endministrator/textures/T_actor_endminf_iris_01_D1.png?url';
import endministratorTex33 from '../../assets/endministrator/textures/T_actor_endminm_iris_01_D.png?url';
import endministratorTex34 from '../../assets/endministrator/textures/T_actor_kholec_cloth_02_P.png?url';
import endministratorTex35 from '../../assets/endministrator/textures/T_actor_pelica_cloth_02_D.png?url';

// Import PMX textures - nahida
import nahidaTex1 from '../../assets/nahida/hair.bmp?url';
import nahidaTex2 from '../../assets/nahida/skin.bmp?url';
import nahidaSph1 from '../../assets/nahida/sph/hair_s.bmp?url';
import nahidaSph2 from '../../assets/nahida/sph/s1.bmp?url';
import nahidaTex8 from '../../assets/nahida/tex/spa_h.png?url';
import nahidaTex6 from '../../assets/nahida/tex/体1.png?url';
import nahidaTex7 from '../../assets/nahida/tex/肌.png?url';
import nahidaTex4 from '../../assets/nahida/tex/颜.png?url';
import nahidaTex5 from '../../assets/nahida/tex/髮1.png?url';
import nahidaTex3 from '../../assets/nahida/toon_defo.bmp?url';

// Import PMX textures - perlica
import perlicaTex1 from '../../assets/perlica/hair_s.png?url';
import perlicaTex2 from '../../assets/perlica/ls.png?url';
import perlicaTex3 from '../../assets/perlica/st-1g1.jpg?url';
import perlicaTex4 from '../../assets/perlica/textures/T_actor_common_body_01_RD.png?url';
import perlicaTex5 from '../../assets/perlica/textures/T_actor_common_cloth_03_RD.png?url';
import perlicaTex6 from '../../assets/perlica/textures/T_actor_common_cloth_04_RD.png?url';
import perlicaTex7 from '../../assets/perlica/textures/T_actor_common_cloth_04_RS.png?url';
import perlicaTex8 from '../../assets/perlica/textures/T_actor_common_eyeshadow_01_M.png?url';
import perlicaTex9 from '../../assets/perlica/textures/T_actor_common_face_01_hl_M.png?url';
import perlicaTex10 from '../../assets/perlica/textures/T_actor_common_face_01_RD.png?url';
import perlicaTex11 from '../../assets/perlica/textures/T_actor_common_female_face_01_cm_M.png?url';
import perlicaTex12 from '../../assets/perlica/textures/T_actor_common_female_face_01_SDF.png?url';
import perlicaTex13 from '../../assets/perlica/textures/T_actor_common_female_face_01_ST.png?url';
import perlicaTex14 from '../../assets/perlica/textures/T_actor_common_femaleskincolor01_lut_D.png?url';
import perlicaTex15 from '../../assets/perlica/textures/T_actor_common_hair_01_RD.png?url';
import perlicaTex16 from '../../assets/perlica/textures/T_actor_common_hair_07_RS.png?url';
import perlicaTex17 from '../../assets/perlica/textures/T_actor_common_hairline_03_M.png?url';
import perlicaTex18 from '../../assets/perlica/textures/T_actor_common_hairshadow_01_M.png?url';
import perlicaTex19 from '../../assets/perlica/textures/T_actor_common_matcap_06_D.png?url';
import perlicaTex20 from '../../assets/perlica/textures/T_actor_pelica_body_01_D.png?url';
import perlicaTex21 from '../../assets/perlica/textures/T_actor_pelica_body_01_N.png?url';
import perlicaTex22 from '../../assets/perlica/textures/T_actor_pelica_cloth_01_D.png?url';
import perlicaTex23 from '../../assets/perlica/textures/T_actor_pelica_cloth_01_E.png?url';
import perlicaTex24 from '../../assets/perlica/textures/T_actor_pelica_cloth_01_N.png?url';
import perlicaTex25 from '../../assets/perlica/textures/T_actor_pelica_cloth_01_P.png?url';
import perlicaTex26 from '../../assets/perlica/textures/T_actor_pelica_cloth_02_D.png?url';
import perlicaTex27 from '../../assets/perlica/textures/T_actor_pelica_cloth_02_E.png?url';
import perlicaTex28 from '../../assets/perlica/textures/T_actor_pelica_cloth_02_N.png?url';
import perlicaTex29 from '../../assets/perlica/textures/T_actor_pelica_cloth_02_P.png?url';
import perlicaTex30 from '../../assets/perlica/textures/T_actor_pelica_face_01_D.png?url';
import perlicaTex31 from '../../assets/perlica/textures/T_actor_pelica_face_01_N.png?url';
import perlicaTex32 from '../../assets/perlica/textures/T_actor_pelica_hair_01_D.png?url';
import perlicaTex33 from '../../assets/perlica/textures/T_actor_pelica_hair_01_HN.png?url';
import perlicaTex34 from '../../assets/perlica/textures/T_actor_pelica_hair_01_P.png?url';
import perlicaTex35 from '../../assets/perlica/textures/T_actor_pelica_hair_01_ST.png?url';
import perlicaTex36 from '../../assets/perlica/textures/T_actor_pelica_hair_01_sw_M.png?url';
import perlicaTex37 from '../../assets/perlica/textures/T_actor_pelica_iris_01_D.png?url';
import perlicaTex38 from '../../assets/perlica/textures/T_wpn_misc_0004_01_D.png?url';
import perlicaTex39 from '../../assets/perlica/textures/T_wpn_misc_0004_01_E.png?url';
import perlicaTex40 from '../../assets/perlica/textures/T_wpn_misc_0004_01_N.png?url';
import perlicaTex41 from '../../assets/perlica/textures/T_wpn_misc_0004_01_P.png?url';
import perlicaTex42 from '../../assets/perlica/textures/white.png?url';

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

  // Load PMX textures based on actual PMX model texture list
  // Endministrator textures
  const endministratorTextures = [
    'hair_s.png',
    'ls.png',
    'st-1g2.jpg',
    'textures\\T_actor_common_cloth_01_RD.png',
    'textures\\T_actor_common_eyeshadow_01_M.png',
    'textures\\T_actor_common_face_01_RD.png',
    'textures\\T_actor_common_female_face_01_cm_M.png',
    'textures\\T_actor_common_female_face_01_SDF.png',
    'textures\\T_actor_common_female_face_01_ST.png',
    'textures\\T_actor_common_hair_01_RD.png',
    'textures\\T_actor_common_hairline_01_M.png',
    'textures\\T_actor_common_hairshadow_01_M.png',
    'textures\\T_actor_common_hairst_01_ST.png',
    'textures\\T_actor_common_hatch_atlas_01_M.png',
    'textures\\T_actor_common_matcap_04_D.png',
    'textures\\T_actor_endminf_body_01_D.png',
    'textures\\T_actor_endminf_body_01_N.png',
    'textures\\T_actor_endminf_cloth_01_D.png',
    'textures\\T_actor_endminf_cloth_01_N.png',
    'textures\\T_actor_endminf_cloth_01_P.png',
    'textures\\T_actor_endminf_cloth_03_D.png',
    'textures\\T_actor_endminf_cloth_03_M.png',
    'textures\\T_actor_endminf_cloth_03_N.png',
    'textures\\T_actor_endminf_cloth_03_P.png',
    'textures\\T_actor_endminf_face_01_D.png',
    'textures\\T_actor_endminf_hair_01_D.png',
    'textures\\T_actor_endminf_hair_01_N.png',
    'textures\\T_actor_endminf_hair_01_P.png',
    'textures\\T_actor_endminf_hair_01_ST.png',
    'textures\\T_actor_endminf_hair_01_sw_M.png',
    'textures\\T_actor_endminf_iris_01_D.png',
    'textures\\T_actor_endminf_iris_01_D1.png',
    'textures\\T_actor_endminm_iris_01_D.png',
    'textures\\T_actor_kholec_cloth_02_P.png',
    'textures\\T_actor_pelica_cloth_02_D.png',
  ];

  // Nahida textures
  const nahidaTextures = [
    'hair.bmp',
    'skin.bmp',
    'toon_defo.bmp',
    'tex/颜.png',
    'tex/髮1.png',
    'tex/体1.png',
    'tex/肌.png',
    'tex/spa_h.png',
    'sph\\hair_s.bmp',
    'sph\\s1.bmp',
  ];

  // Perlica textures
  const perlicaTextures = [
    'hair_s.png',
    'ls.png',
    'st-1g1.jpg',
    'textures\\T_actor_common_body_01_RD.png',
    'textures\\T_actor_common_cloth_03_RD.png',
    'textures\\T_actor_common_cloth_04_RD.png',
    'textures\\T_actor_common_cloth_04_RS.png',
    'textures\\T_actor_common_eyeshadow_01_M.png',
    'textures\\T_actor_common_face_01_hl_M.png',
    'textures\\T_actor_common_face_01_RD.png',
    'textures\\T_actor_common_female_face_01_cm_M.png',
    'textures\\T_actor_common_female_face_01_SDF.png',
    'textures\\T_actor_common_female_face_01_ST.png',
    'textures\\T_actor_common_femaleskincolor01_lut_D.png',
    'textures\\T_actor_common_hair_01_RD.png',
    'textures\\T_actor_common_hair_07_RS.png',
    'textures\\T_actor_common_hairline_03_M.png',
    'textures\\T_actor_common_hairshadow_01_M.png',
    'textures\\T_actor_common_matcap_06_D.png',
    'textures\\T_actor_pelica_body_01_D.png',
    'textures\\T_actor_pelica_body_01_N.png',
    'textures\\T_actor_pelica_cloth_01_D.png',
    'textures\\T_actor_pelica_cloth_01_E.png',
    'textures\\T_actor_pelica_cloth_01_N.png',
    'textures\\T_actor_pelica_cloth_01_P.png',
    'textures\\T_actor_pelica_cloth_02_D.png',
    'textures\\T_actor_pelica_cloth_02_E.png',
    'textures\\T_actor_pelica_cloth_02_N.png',
    'textures\\T_actor_pelica_cloth_02_P.png',
    'textures\\T_actor_pelica_face_01_D.png',
    'textures\\T_actor_pelica_face_01_N.png',
    'textures\\T_actor_pelica_hair_01_D.png',
    'textures\\T_actor_pelica_hair_01_HN.png',
    'textures\\T_actor_pelica_hair_01_P.png',
    'textures\\T_actor_pelica_hair_01_ST.png',
    'textures\\T_actor_pelica_hair_01_sw_M.png',
    'textures\\T_actor_pelica_iris_01_D.png',
    'textures\\T_wpn_misc_0004_01_D.png',
    'textures\\T_wpn_misc_0004_01_E.png',
    'textures\\T_wpn_misc_0004_01_N.png',
    'textures\\T_wpn_misc_0004_01_P.png',
    'textures\\white.png',
  ];

  // Create separate texture maps for each model to avoid key conflicts
  const endministratorTextureMap = {
    'hair_s.png': endministratorTex1,
    'ls.png': endministratorTex2,
    'st-1g2.jpg': endministratorTex3,
    'textures\\T_actor_common_cloth_01_RD.png': endministratorTex4,
    'textures\\T_actor_common_eyeshadow_01_M.png': endministratorTex5,
    'textures\\T_actor_common_face_01_RD.png': endministratorTex6,
    'textures\\T_actor_common_female_face_01_cm_M.png': endministratorTex7,
    'textures\\T_actor_common_female_face_01_SDF.png': endministratorTex8,
    'textures\\T_actor_common_female_face_01_ST.png': endministratorTex9,
    'textures\\T_actor_common_hair_01_RD.png': endministratorTex10,
    'textures\\T_actor_common_hairline_01_M.png': endministratorTex11,
    'textures\\T_actor_common_hairshadow_01_M.png': endministratorTex12,
    'textures\\T_actor_common_hairst_01_ST.png': endministratorTex13,
    'textures\\T_actor_common_hatch_atlas_01_M.png': endministratorTex14,
    'textures\\T_actor_common_matcap_04_D.png': endministratorTex15,
    'textures\\T_actor_endminf_body_01_D.png': endministratorTex16,
    'textures\\T_actor_endminf_body_01_N.png': endministratorTex17,
    'textures\\T_actor_endminf_cloth_01_D.png': endministratorTex18,
    'textures\\T_actor_endminf_cloth_01_N.png': endministratorTex19,
    'textures\\T_actor_endminf_cloth_01_P.png': endministratorTex20,
    'textures\\T_actor_endminf_cloth_03_D.png': endministratorTex21,
    'textures\\T_actor_endminf_cloth_03_M.png': endministratorTex22,
    'textures\\T_actor_endminf_cloth_03_N.png': endministratorTex23,
    'textures\\T_actor_endminf_cloth_03_P.png': endministratorTex24,
    'textures\\T_actor_endminf_face_01_D.png': endministratorTex25,
    'textures\\T_actor_endminf_hair_01_D.png': endministratorTex26,
    'textures\\T_actor_endminf_hair_01_N.png': endministratorTex27,
    'textures\\T_actor_endminf_hair_01_P.png': endministratorTex28,
    'textures\\T_actor_endminf_hair_01_ST.png': endministratorTex29,
    'textures\\T_actor_endminf_hair_01_sw_M.png': endministratorTex30,
    'textures\\T_actor_endminf_iris_01_D.png': endministratorTex31,
    'textures\\T_actor_endminf_iris_01_D1.png': endministratorTex32,
    'textures\\T_actor_endminm_iris_01_D.png': endministratorTex33,
    'textures\\T_actor_kholec_cloth_02_P.png': endministratorTex34,
    'textures\\T_actor_pelica_cloth_02_D.png': endministratorTex35,
  };

  const nahidaTextureMap = {
    'hair.bmp': nahidaTex1,
    'skin.bmp': nahidaTex2,
    'toon_defo.bmp': nahidaTex3,
    'tex/颜.png': nahidaTex4,
    'tex/髮1.png': nahidaTex5,
    'tex/体1.png': nahidaTex6,
    'tex/肌.png': nahidaTex7,
    'tex/spa_h.png': nahidaTex8,
    'sph\\hair_s.bmp': nahidaSph1,
    'sph\\s1.bmp': nahidaSph2,
  };

  const perlicaTextureMap = {
    'hair_s.png': perlicaTex1,
    'ls.png': perlicaTex2,
    'st-1g1.jpg': perlicaTex3,
    'textures\\T_actor_common_body_01_RD.png': perlicaTex4,
    'textures\\T_actor_common_cloth_03_RD.png': perlicaTex5,
    'textures\\T_actor_common_cloth_04_RD.png': perlicaTex6,
    'textures\\T_actor_common_cloth_04_RS.png': perlicaTex7,
    'textures\\T_actor_common_eyeshadow_01_M.png': perlicaTex8,
    'textures\\T_actor_common_face_01_hl_M.png': perlicaTex9,
    'textures\\T_actor_common_face_01_RD.png': perlicaTex10,
    'textures\\T_actor_common_female_face_01_cm_M.png': perlicaTex11,
    'textures\\T_actor_common_female_face_01_SDF.png': perlicaTex12,
    'textures\\T_actor_common_female_face_01_ST.png': perlicaTex13,
    'textures\\T_actor_common_femaleskincolor01_lut_D.png': perlicaTex14,
    'textures\\T_actor_common_hair_01_RD.png': perlicaTex15,
    'textures\\T_actor_common_hair_07_RS.png': perlicaTex16,
    'textures\\T_actor_common_hairline_03_M.png': perlicaTex17,
    'textures\\T_actor_common_hairshadow_01_M.png': perlicaTex18,
    'textures\\T_actor_common_matcap_06_D.png': perlicaTex19,
    'textures\\T_actor_pelica_body_01_D.png': perlicaTex20,
    'textures\\T_actor_pelica_body_01_N.png': perlicaTex21,
    'textures\\T_actor_pelica_cloth_01_D.png': perlicaTex22,
    'textures\\T_actor_pelica_cloth_01_E.png': perlicaTex23,
    'textures\\T_actor_pelica_cloth_01_N.png': perlicaTex24,
    'textures\\T_actor_pelica_cloth_01_P.png': perlicaTex25,
    'textures\\T_actor_pelica_cloth_02_D.png': perlicaTex26,
    'textures\\T_actor_pelica_cloth_02_E.png': perlicaTex27,
    'textures\\T_actor_pelica_cloth_02_N.png': perlicaTex28,
    'textures\\T_actor_pelica_cloth_02_P.png': perlicaTex29,
    'textures\\T_actor_pelica_face_01_D.png': perlicaTex30,
    'textures\\T_actor_pelica_face_01_N.png': perlicaTex31,
    'textures\\T_actor_pelica_hair_01_D.png': perlicaTex32,
    'textures\\T_actor_pelica_hair_01_HN.png': perlicaTex33,
    'textures\\T_actor_pelica_hair_01_P.png': perlicaTex34,
    'textures\\T_actor_pelica_hair_01_ST.png': perlicaTex35,
    'textures\\T_actor_pelica_hair_01_sw_M.png': perlicaTex36,
    'textures\\T_actor_pelica_iris_01_D.png': perlicaTex37,
    'textures\\T_wpn_misc_0004_01_D.png': perlicaTex38,
    'textures\\T_wpn_misc_0004_01_E.png': perlicaTex39,
    'textures\\T_wpn_misc_0004_01_N.png': perlicaTex40,
    'textures\\T_wpn_misc_0004_01_P.png': perlicaTex41,
    'textures\\white.png': perlicaTex42,
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

  // Load PMX model and its textures
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
