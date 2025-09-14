/**
 * Endministrator model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import endministratorTex1 from '../../../assets/endministrator/textures/hair_s.png?url';
import endministratorTex2 from '../../../assets/endministrator/textures/ls.png?url';
import endministratorTex3 from '../../../assets/endministrator/textures/st-1g2.jpg?url';
import endministratorTex4 from '../../../assets/endministrator/textures/T_actor_common_cloth_01_RD.png?url';
import endministratorTex5 from '../../../assets/endministrator/textures/T_actor_common_eyeshadow_01_M.png?url';
import endministratorTex6 from '../../../assets/endministrator/textures/T_actor_common_face_01_RD.png?url';
import endministratorTex7 from '../../../assets/endministrator/textures/T_actor_common_female_face_01_cm_M.png?url';
import endministratorTex8 from '../../../assets/endministrator/textures/T_actor_common_female_face_01_SDF.png?url';
import endministratorTex9 from '../../../assets/endministrator/textures/T_actor_common_female_face_01_ST.png?url';
import endministratorTex10 from '../../../assets/endministrator/textures/T_actor_common_hair_01_RD.png?url';
import endministratorTex11 from '../../../assets/endministrator/textures/T_actor_common_hairline_01_M.png?url';
import endministratorTex12 from '../../../assets/endministrator/textures/T_actor_common_hairshadow_01_M.png?url';
import endministratorTex13 from '../../../assets/endministrator/textures/T_actor_common_hairst_01_ST.png?url';
import endministratorTex14 from '../../../assets/endministrator/textures/T_actor_common_hatch_atlas_01_M.png?url';
import endministratorTex15 from '../../../assets/endministrator/textures/T_actor_common_matcap_04_D.png?url';
import endministratorTex16 from '../../../assets/endministrator/textures/T_actor_endminf_body_01_D.png?url';
import endministratorTex17 from '../../../assets/endministrator/textures/T_actor_endminf_body_01_N.png?url';
import endministratorTex18 from '../../../assets/endministrator/textures/T_actor_endminf_cloth_01_D.png?url';
import endministratorTex19 from '../../../assets/endministrator/textures/T_actor_endminf_cloth_01_N.png?url';
import endministratorTex20 from '../../../assets/endministrator/textures/T_actor_endminf_cloth_01_P.png?url';
import endministratorTex21 from '../../../assets/endministrator/textures/T_actor_endminf_cloth_03_D.png?url';
import endministratorTex22 from '../../../assets/endministrator/textures/T_actor_endminf_cloth_03_M.png?url';
import endministratorTex23 from '../../../assets/endministrator/textures/T_actor_endminf_cloth_03_N.png?url';
import endministratorTex24 from '../../../assets/endministrator/textures/T_actor_endminf_cloth_03_P.png?url';
import endministratorTex25 from '../../../assets/endministrator/textures/T_actor_endminf_face_01_D.png?url';
import endministratorTex26 from '../../../assets/endministrator/textures/T_actor_endminf_hair_01_D.png?url';
import endministratorTex27 from '../../../assets/endministrator/textures/T_actor_endminf_hair_01_N.png?url';
import endministratorTex28 from '../../../assets/endministrator/textures/T_actor_endminf_hair_01_P.png?url';
import endministratorTex29 from '../../../assets/endministrator/textures/T_actor_endminf_hair_01_ST.png?url';
import endministratorTex30 from '../../../assets/endministrator/textures/T_actor_endminf_hair_01_sw_M.png?url';
import endministratorTex31 from '../../../assets/endministrator/textures/T_actor_endminf_iris_01_D.png?url';
import endministratorTex32 from '../../../assets/endministrator/textures/T_actor_endminf_iris_01_D1.png?url';
import endministratorTex33 from '../../../assets/endministrator/textures/T_actor_endminm_iris_01_D.png?url';
import endministratorTex34 from '../../../assets/endministrator/textures/T_actor_kholec_cloth_02_P.png?url';
import endministratorTex35 from '../../../assets/endministrator/textures/T_actor_pelica_cloth_02_D.png?url';

export const endministratorDescriptor: PMXAssetDescriptor = {
  modelId: 'endministrator',
  pmxPath: 'models/endministrator.pmx',
  materialDefinitions: {
    M_actor_endminf_body_01: {
      textures: {
        diffuse: 'textures/T_actor_endminf_body_01_D.png',
        normal: 'textures/T_actor_endminf_body_01_N.png',
      },
    },
    M_actor_endminf_cloth_01: {
      textures: {
        diffuse: 'textures/T_actor_endminf_cloth_01_D.png',
        normal: 'textures/T_actor_endminf_cloth_01_N.png',
        specular: 'textures/T_actor_endminf_cloth_01_P.png',
      },
    },
    M_actor_endminf_cloth_02: {
      textures: {
        diffuse: 'textures/T_actor_pelica_cloth_02_D.png',
        specular: 'textures/T_actor_kholec_cloth_02_P.png',
      },
    },
    M_actor_endminf_cloth_03: {
      textures: {
        diffuse: 'textures/T_actor_endminf_cloth_03_D.png',
        normal: 'textures/T_actor_endminf_cloth_03_N.png',
        specular: 'textures/T_actor_endminf_cloth_03_P.png',
        metallic: 'textures/T_actor_endminf_cloth_03_M.png',
      },
    },
    M_actor_endminf_face_01: {
      textures: {
        diffuse: 'textures/T_actor_endminf_face_01_D.png',
      },
    },
    M_actor_endminf_hair_01: {
      textures: {
        diffuse: 'textures/T_actor_endminf_hair_01_D.png',
        normal: 'textures/T_actor_endminf_hair_01_N.png',
        specular: 'textures/T_actor_endminf_hair_01_P.png',
        metallic: 'textures/T_actor_endminf_hair_01_sw_M.png',
      },
    },
    M_actor_endminf_iris_01: {
      textures: {
        diffuse: 'textures/T_actor_endminf_iris_01_D.png',
      },
    },
    M_eyeshadow_common_01: {
      textures: {
        metallic: 'textures/T_actor_common_eyeshadow_01_M.png',
      },
    },
    M_hairshadow_common_04: {
      textures: {
        metallic: 'textures/T_actor_common_hairshadow_01_M.png',
      },
    },
    M_actor_endminf_cloth_06: {
      textures: {
        diffuse: 'textures/T_actor_endminf_cloth_01_D.png',
        normal: 'textures/T_actor_endminf_cloth_01_N.png',
        specular: 'textures/T_actor_endminf_cloth_01_P.png',
      },
    },
  },
  sharedTextures: {
    toon: ['textures/st-1g2.jpg'],
    sphere: ['textures/ls.png', 'textures/hair_s.png'],
    matcap: ['textures/T_actor_common_matcap_04_D.png'],
  },
  textureUrlMap: {
    'textures/hair_s.png': endministratorTex1,
    'textures/ls.png': endministratorTex2,
    'textures/st-1g2.jpg': endministratorTex3,
    'textures/T_actor_common_cloth_01_RD.png': endministratorTex4,
    'textures/T_actor_common_eyeshadow_01_M.png': endministratorTex5,
    'textures/T_actor_common_face_01_RD.png': endministratorTex6,
    'textures/T_actor_common_female_face_01_cm_M.png': endministratorTex7,
    'textures/T_actor_common_female_face_01_SDF.png': endministratorTex8,
    'textures/T_actor_common_female_face_01_ST.png': endministratorTex9,
    'textures/T_actor_common_hair_01_RD.png': endministratorTex10,
    'textures/T_actor_common_hairline_01_M.png': endministratorTex11,
    'textures/T_actor_common_hairshadow_01_M.png': endministratorTex12,
    'textures/T_actor_common_hairst_01_ST.png': endministratorTex13,
    'textures/T_actor_common_hatch_atlas_01_M.png': endministratorTex14,
    'textures/T_actor_common_matcap_04_D.png': endministratorTex15,
    'textures/T_actor_endminf_body_01_D.png': endministratorTex16,
    'textures/T_actor_endminf_body_01_N.png': endministratorTex17,
    'textures/T_actor_endminf_cloth_01_D.png': endministratorTex18,
    'textures/T_actor_endminf_cloth_01_N.png': endministratorTex19,
    'textures/T_actor_endminf_cloth_01_P.png': endministratorTex20,
    'textures/T_actor_endminf_cloth_03_D.png': endministratorTex21,
    'textures/T_actor_endminf_cloth_03_M.png': endministratorTex22,
    'textures/T_actor_endminf_cloth_03_N.png': endministratorTex23,
    'textures/T_actor_endminf_cloth_03_P.png': endministratorTex24,
    'textures/T_actor_endminf_face_01_D.png': endministratorTex25,
    'textures/T_actor_endminf_hair_01_D.png': endministratorTex26,
    'textures/T_actor_endminf_hair_01_N.png': endministratorTex27,
    'textures/T_actor_endminf_hair_01_P.png': endministratorTex28,
    'textures/T_actor_endminf_hair_01_ST.png': endministratorTex29,
    'textures/T_actor_endminf_hair_01_sw_M.png': endministratorTex30,
    'textures/T_actor_endminf_iris_01_D.png': endministratorTex31,
    'textures/T_actor_endminf_iris_01_D1.png': endministratorTex32,
    'textures/T_actor_endminm_iris_01_D.png': endministratorTex33,
    'textures/T_actor_kholec_cloth_02_P.png': endministratorTex34,
    'textures/T_actor_pelica_cloth_02_D.png': endministratorTex35,
  },
};
