/**
 * Perlica model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import perlicaTex1 from '../../../assets/perlica/hair_s.png?url';
import perlicaTex2 from '../../../assets/perlica/ls.png?url';
import perlicaTex3 from '../../../assets/perlica/st-1g1.jpg?url';
import perlicaTex4 from '../../../assets/perlica/textures/T_actor_common_body_01_RD.png?url';
import perlicaTex5 from '../../../assets/perlica/textures/T_actor_common_cloth_03_RD.png?url';
import perlicaTex6 from '../../../assets/perlica/textures/T_actor_common_cloth_04_RD.png?url';
import perlicaTex7 from '../../../assets/perlica/textures/T_actor_common_cloth_04_RS.png?url';
import perlicaTex8 from '../../../assets/perlica/textures/T_actor_common_eyeshadow_01_M.png?url';
import perlicaTex9 from '../../../assets/perlica/textures/T_actor_common_face_01_hl_M.png?url';
import perlicaTex10 from '../../../assets/perlica/textures/T_actor_common_face_01_RD.png?url';
import perlicaTex11 from '../../../assets/perlica/textures/T_actor_common_female_face_01_cm_M.png?url';
import perlicaTex12 from '../../../assets/perlica/textures/T_actor_common_female_face_01_SDF.png?url';
import perlicaTex13 from '../../../assets/perlica/textures/T_actor_common_female_face_01_ST.png?url';
import perlicaTex14 from '../../../assets/perlica/textures/T_actor_common_femaleskincolor01_lut_D.png?url';
import perlicaTex15 from '../../../assets/perlica/textures/T_actor_common_hair_01_RD.png?url';
import perlicaTex16 from '../../../assets/perlica/textures/T_actor_common_hair_07_RS.png?url';
import perlicaTex17 from '../../../assets/perlica/textures/T_actor_common_hairline_03_M.png?url';
import perlicaTex18 from '../../../assets/perlica/textures/T_actor_common_hairshadow_01_M.png?url';
import perlicaTex19 from '../../../assets/perlica/textures/T_actor_common_matcap_06_D.png?url';
import perlicaTex20 from '../../../assets/perlica/textures/T_actor_pelica_body_01_D.png?url';
import perlicaTex21 from '../../../assets/perlica/textures/T_actor_pelica_body_01_N.png?url';
import perlicaTex22 from '../../../assets/perlica/textures/T_actor_pelica_cloth_01_D.png?url';
import perlicaTex23 from '../../../assets/perlica/textures/T_actor_pelica_cloth_01_E.png?url';
import perlicaTex24 from '../../../assets/perlica/textures/T_actor_pelica_cloth_01_N.png?url';
import perlicaTex25 from '../../../assets/perlica/textures/T_actor_pelica_cloth_01_P.png?url';
import perlicaTex26 from '../../../assets/perlica/textures/T_actor_pelica_cloth_02_D.png?url';
import perlicaTex27 from '../../../assets/perlica/textures/T_actor_pelica_cloth_02_E.png?url';
import perlicaTex28 from '../../../assets/perlica/textures/T_actor_pelica_cloth_02_N.png?url';
import perlicaTex29 from '../../../assets/perlica/textures/T_actor_pelica_cloth_02_P.png?url';
import perlicaTex30 from '../../../assets/perlica/textures/T_actor_pelica_face_01_D.png?url';
import perlicaTex31 from '../../../assets/perlica/textures/T_actor_pelica_face_01_N.png?url';
import perlicaTex32 from '../../../assets/perlica/textures/T_actor_pelica_hair_01_D.png?url';
import perlicaTex33 from '../../../assets/perlica/textures/T_actor_pelica_hair_01_HN.png?url';
import perlicaTex34 from '../../../assets/perlica/textures/T_actor_pelica_hair_01_P.png?url';
import perlicaTex35 from '../../../assets/perlica/textures/T_actor_pelica_hair_01_ST.png?url';
import perlicaTex36 from '../../../assets/perlica/textures/T_actor_pelica_hair_01_sw_M.png?url';
import perlicaTex37 from '../../../assets/perlica/textures/T_actor_pelica_iris_01_D.png?url';
import perlicaTex38 from '../../../assets/perlica/textures/T_wpn_misc_0004_01_D.png?url';
import perlicaTex39 from '../../../assets/perlica/textures/T_wpn_misc_0004_01_E.png?url';
import perlicaTex40 from '../../../assets/perlica/textures/T_wpn_misc_0004_01_N.png?url';
import perlicaTex41 from '../../../assets/perlica/textures/T_wpn_misc_0004_01_P.png?url';
import perlicaTex42 from '../../../assets/perlica/textures/white.png?url';

export const perlicaDescriptor: PMXAssetDescriptor = {
  modelId: 'perlica',
  pmxPath: 'models/perlica.pmx',
  materialDefinitions: {
    面: {
      textures: {
        diffuse: 'textures/T_actor_pelica_face_01_D.png',
        normal: 'textures/T_actor_pelica_face_01_N.png',
      },
    },
    目: {
      textures: {
        diffuse: 'textures/T_actor_pelica_iris_01_D.png',
      },
    },
    目HL: {
      textures: {
        diffuse: 'textures/T_actor_pelica_iris_01_D.png',
      },
    },
    目白: {
      textures: {
        diffuse: 'textures/T_actor_pelica_face_01_D.png',
      },
    },
    睫眉: {
      textures: {
        diffuse: 'textures/T_actor_pelica_face_01_D.png',
      },
    },
    口内: {
      textures: {
        diffuse: 'textures/T_actor_pelica_face_01_D.png',
      },
    },
    唇: {
      textures: {
        diffuse: 'textures/T_actor_pelica_face_01_D.png',
      },
    },
    耳: {
      textures: {
        diffuse: 'textures/T_actor_pelica_face_01_D.png',
      },
    },
    发: {
      textures: {
        diffuse: 'textures/T_actor_pelica_hair_01_D.png',
        normal: 'textures/T_actor_pelica_hair_01_HN.png', //  HN = Hair Normal
        specular: 'textures/T_actor_pelica_hair_01_P.png',
        metallic: 'textures/T_actor_pelica_hair_01_sw_M.png',
      },
    },
    肌: {
      textures: {
        diffuse: 'textures/T_actor_pelica_body_01_D.png',
        normal: 'textures/T_actor_pelica_body_01_N.png',
      },
    },
    M_actor_pelica_cloth_01: {
      textures: {
        diffuse: 'textures/T_actor_pelica_cloth_01_D.png',
        normal: 'textures/T_actor_pelica_cloth_01_N.png',
        specular: 'textures/T_actor_pelica_cloth_01_P.png',
        emission: 'textures/T_actor_pelica_cloth_01_E.png',
      },
    },
    M_actor_pelica_cloth_02: {
      textures: {
        diffuse: 'textures/T_actor_pelica_cloth_02_D.png',
        normal: 'textures/T_actor_pelica_cloth_02_N.png',
        specular: 'textures/T_actor_pelica_cloth_02_P.png',
        emission: 'textures/T_actor_pelica_cloth_02_E.png',
      },
    },
    M_actor_pelica_cloth_04: {
      textures: {
        diffuse: 'textures/T_actor_pelica_cloth_01_D.png',
        normal: 'textures/T_actor_pelica_cloth_01_N.png',
        specular: 'textures/T_actor_pelica_cloth_01_P.png',
        emission: 'textures/T_actor_pelica_cloth_01_E.png',
      },
    },
    M_actor_pelica_cloth_03: {
      textures: {
        diffuse: 'textures/T_actor_pelica_cloth_02_D.png',
        normal: 'textures/T_actor_pelica_cloth_02_N.png',
        specular: 'textures/T_actor_pelica_cloth_02_P.png',
        emission: 'textures/T_actor_pelica_cloth_02_E.png',
      },
    },
    M_eyeshadow_common_01: {
      textures: {
        specular: 'textures/T_actor_common_eyeshadow_01_M.png', // 眼影遮罩
      },
    },
    M_hairshadow_common_01: {
      textures: {
        specular: 'hair_s.png',
        diffuse: 'textures/T_actor_common_hairshadow_01_M.png', // 发影遮罩
      },
    },
    M_actor_common_face: {
      textures: {
        diffuse: 'textures/T_actor_common_face_01_RD.png',
        specular: 'textures/T_actor_common_face_01_hl_M.png',
      },
    },
  },
  sharedTextures: {
    toon: ['st-1g1.jpg'],
    sphere: ['ls.png'],
  },
  textureUrlMap: {
    'hair_s.png': perlicaTex1,
    'ls.png': perlicaTex2,
    'st-1g1.jpg': perlicaTex3,
    'textures/T_actor_common_body_01_RD.png': perlicaTex4,
    'textures/T_actor_common_cloth_03_RD.png': perlicaTex5,
    'textures/T_actor_common_cloth_04_RD.png': perlicaTex6,
    'textures/T_actor_common_cloth_04_RS.png': perlicaTex7,
    'textures/T_actor_common_eyeshadow_01_M.png': perlicaTex8,
    'textures/T_actor_common_face_01_hl_M.png': perlicaTex9,
    'textures/T_actor_common_face_01_RD.png': perlicaTex10,
    'textures/T_actor_common_female_face_01_cm_M.png': perlicaTex11,
    'textures/T_actor_common_female_face_01_SDF.png': perlicaTex12,
    'textures/T_actor_common_female_face_01_ST.png': perlicaTex13,
    'textures/T_actor_common_femaleskincolor01_lut_D.png': perlicaTex14,
    'textures/T_actor_common_hair_01_RD.png': perlicaTex15,
    'textures/T_actor_common_hair_07_RS.png': perlicaTex16,
    'textures/T_actor_common_hairline_03_M.png': perlicaTex17,
    'textures/T_actor_common_hairshadow_01_M.png': perlicaTex18,
    'textures/T_actor_common_matcap_06_D.png': perlicaTex19,
    'textures/T_actor_pelica_body_01_D.png': perlicaTex20,
    'textures/T_actor_pelica_body_01_N.png': perlicaTex21,
    'textures/T_actor_pelica_cloth_01_D.png': perlicaTex22,
    'textures/T_actor_pelica_cloth_01_E.png': perlicaTex23,
    'textures/T_actor_pelica_cloth_01_N.png': perlicaTex24,
    'textures/T_actor_pelica_cloth_01_P.png': perlicaTex25,
    'textures/T_actor_pelica_cloth_02_D.png': perlicaTex26,
    'textures/T_actor_pelica_cloth_02_E.png': perlicaTex27,
    'textures/T_actor_pelica_cloth_02_N.png': perlicaTex28,
    'textures/T_actor_pelica_cloth_02_P.png': perlicaTex29,
    'textures/T_actor_pelica_face_01_D.png': perlicaTex30,
    'textures/T_actor_pelica_face_01_N.png': perlicaTex31,
    'textures/T_actor_pelica_hair_01_D.png': perlicaTex32,
    'textures/T_actor_pelica_hair_01_HN.png': perlicaTex33,
    'textures/T_actor_pelica_hair_01_P.png': perlicaTex34,
    'textures/T_actor_pelica_hair_01_ST.png': perlicaTex35,
    'textures/T_actor_pelica_hair_01_sw_M.png': perlicaTex36,
    'textures/T_actor_pelica_iris_01_D.png': perlicaTex37,
    'textures/T_wpn_misc_0004_01_D.png': perlicaTex38,
    'textures/T_wpn_misc_0004_01_E.png': perlicaTex39,
    'textures/T_wpn_misc_0004_01_N.png': perlicaTex40,
    'textures/T_wpn_misc_0004_01_P.png': perlicaTex41,
    'textures/white.png': perlicaTex42,
  },
};
