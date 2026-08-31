/**
 * Si (祀, Arknights: Endfield) model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import siTex1 from '../../../../assets/si/textures/T_actor_jsspsi_face_01_D.png?url';
import siTex2 from '../../../../assets/si/textures/T_actor_jsspsi_iris_01_D.png?url';
import siTex3 from '../../../../assets/si/textures/T_actor_jsspsi_body_01_D.png?url';
import siTex4 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_01_D.png?url';
import siTex5 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_02_D.png?url';
import siTex6 from '../../../../assets/si/textures/T_actor_common_female_emotion_atlas_01_D.png?url';
import siTex7 from '../../../../assets/si/textures/T_actor_jsspsi_hair_01_D.png?url';
import siTex8 from '../../../../assets/si/textures/T_actor_jsspsi_body_01_N.png?url';
import siTex9 from '../../../../assets/si/textures/T_actor_jsspsi_face_01_N.png?url';
import siTex10 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_01_N.png?url';
import siTex11 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_01_E.png?url';
import siTex12 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_01_P.png?url';
import siTex13 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_02_N.png?url';
import siTex14 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_02_E.png?url';
import siTex15 from '../../../../assets/si/textures/T_actor_jsspsi_cloth_02_P.png?url';
import siTex16 from '../../../../assets/si/textures/T_actor_jsspsi_hair_01_HN.png?url';
import siTex17 from '../../../../assets/si/textures/T_actor_jsspsi_hair_01_P.png?url';

export const siDescriptor: PMXAssetDescriptor = {
  modelId: 'si',
  pmxPath: 'assets/si/祀.pmx',
  materialDefinitions: {
    面: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_face_01_D.png',
        normal: 'textures/T_actor_jsspsi_face_01_N.png',
      },
    },
    目: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_iris_01_D.png',
      },
    },
    目HL: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_iris_01_D.png',
      },
    },
    目白: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_face_01_D.png',
      },
    },
    目影: {
      textures: {},
    },
    睫眉: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_face_01_D.png',
      },
    },
    口内: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_face_01_D.png',
      },
    },
    肌: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_body_01_D.png',
        normal: 'textures/T_actor_jsspsi_body_01_N.png',
      },
    },
    Cloth1: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_cloth_01_D.png',
        normal: 'textures/T_actor_jsspsi_cloth_01_N.png',
        specular: 'textures/T_actor_jsspsi_cloth_01_P.png',
        emission: 'textures/T_actor_jsspsi_cloth_01_E.png',
      },
    },
    Cloth2: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_cloth_02_D.png',
        normal: 'textures/T_actor_jsspsi_cloth_02_N.png',
        specular: 'textures/T_actor_jsspsi_cloth_02_P.png',
        emission: 'textures/T_actor_jsspsi_cloth_02_E.png',
      },
    },
    Cloth1Alpha: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_cloth_01_D.png',
        normal: 'textures/T_actor_jsspsi_cloth_01_N.png',
        specular: 'textures/T_actor_jsspsi_cloth_01_P.png',
        emission: 'textures/T_actor_jsspsi_cloth_01_E.png',
      },
    },
    表情: {
      textures: {
        diffuse: 'textures/T_actor_common_female_emotion_atlas_01_D.png',
      },
    },
    发: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_hair_01_D.png',
        normal: 'textures/T_actor_jsspsi_hair_01_HN.png',
        specular: 'textures/T_actor_jsspsi_hair_01_P.png',
      },
    },
    发影: {
      textures: {
        diffuse: 'textures/T_actor_jsspsi_body_01_N.png',
      },
    },
  },
  textureUrlMap: {
    'textures/T_actor_jsspsi_face_01_D.png': siTex1,
    'textures/T_actor_jsspsi_iris_01_D.png': siTex2,
    'textures/T_actor_jsspsi_body_01_D.png': siTex3,
    'textures/T_actor_jsspsi_cloth_01_D.png': siTex4,
    'textures/T_actor_jsspsi_cloth_02_D.png': siTex5,
    'textures/T_actor_common_female_emotion_atlas_01_D.png': siTex6,
    'textures/T_actor_jsspsi_hair_01_D.png': siTex7,
    'textures/T_actor_jsspsi_body_01_N.png': siTex8,
    'textures/T_actor_jsspsi_face_01_N.png': siTex9,
    'textures/T_actor_jsspsi_cloth_01_N.png': siTex10,
    'textures/T_actor_jsspsi_cloth_01_E.png': siTex11,
    'textures/T_actor_jsspsi_cloth_01_P.png': siTex12,
    'textures/T_actor_jsspsi_cloth_02_N.png': siTex13,
    'textures/T_actor_jsspsi_cloth_02_E.png': siTex14,
    'textures/T_actor_jsspsi_cloth_02_P.png': siTex15,
    'textures/T_actor_jsspsi_hair_01_HN.png': siTex16,
    'textures/T_actor_jsspsi_hair_01_P.png': siTex17,
  },
};
