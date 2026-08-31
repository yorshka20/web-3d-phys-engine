/**
 * Zhuang Fangyi (庄方宜, Arknights: Endfield) model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import zfyTex1 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_face_01_D.png?url';
import zfyTex2 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_iris_01_D.png?url';
import zfyTex3 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_hair_01_D.png?url';
import zfyTex4 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_body_01_D.png?url';
import zfyTex5 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_cloth_01_D.png?url';
import zfyTex6 from '../../../../assets/zhuangfangyi/textures/T_actor_common_female_emotion_atlas_01_D.png?url';
import zfyTex7 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_body_01_N.png?url';
import zfyTex8 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_cloth_01_N.png?url';
import zfyTex9 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_cloth_01_E.png?url';
import zfyTex10 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_cloth_01_P.png?url';
import zfyTex11 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_hair_01_HN.png?url';
import zfyTex12 from '../../../../assets/zhuangfangyi/textures/T_actor_zhuangfy_hair_01_P.png?url';

export const zhuangfangyiDescriptor: PMXAssetDescriptor = {
  modelId: 'zhuangfangyi',
  pmxPath: 'assets/zhuangfangyi/庄方宜.pmx',
  materialDefinitions: {
    面: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_face_01_D.png',
      },
    },
    目: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_iris_01_D.png',
      },
    },
    目HL: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_iris_01_D.png',
      },
    },
    目白: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_face_01_D.png',
      },
    },
    目影: {
      textures: {},
    },
    睫眉: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_face_01_D.png',
      },
    },
    口内: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_face_01_D.png',
      },
    },
    发: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_hair_01_D.png',
        normal: 'textures/T_actor_zhuangfy_hair_01_HN.png',
        specular: 'textures/T_actor_zhuangfy_hair_01_P.png',
      },
    },
    发影: {
      textures: {},
    },
    肌: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_body_01_D.png',
        normal: 'textures/T_actor_zhuangfy_body_01_N.png',
      },
    },
    Cloth1: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_cloth_01_D.png',
        normal: 'textures/T_actor_zhuangfy_cloth_01_N.png',
        specular: 'textures/T_actor_zhuangfy_cloth_01_P.png',
        emission: 'textures/T_actor_zhuangfy_cloth_01_E.png',
      },
    },
    Cloth1Alpha: {
      textures: {
        diffuse: 'textures/T_actor_zhuangfy_cloth_01_D.png',
        normal: 'textures/T_actor_zhuangfy_cloth_01_N.png',
        specular: 'textures/T_actor_zhuangfy_cloth_01_P.png',
        emission: 'textures/T_actor_zhuangfy_cloth_01_E.png',
      },
    },
    照れ: {
      textures: {
        diffuse: 'textures/T_actor_common_female_emotion_atlas_01_D.png',
      },
    },
  },
  textureUrlMap: {
    'textures/T_actor_zhuangfy_face_01_D.png': zfyTex1,
    'textures/T_actor_zhuangfy_iris_01_D.png': zfyTex2,
    'textures/T_actor_zhuangfy_hair_01_D.png': zfyTex3,
    'textures/T_actor_zhuangfy_body_01_D.png': zfyTex4,
    'textures/T_actor_zhuangfy_cloth_01_D.png': zfyTex5,
    'textures/T_actor_common_female_emotion_atlas_01_D.png': zfyTex6,
    'textures/T_actor_zhuangfy_body_01_N.png': zfyTex7,
    'textures/T_actor_zhuangfy_cloth_01_N.png': zfyTex8,
    'textures/T_actor_zhuangfy_cloth_01_E.png': zfyTex9,
    'textures/T_actor_zhuangfy_cloth_01_P.png': zfyTex10,
    'textures/T_actor_zhuangfy_hair_01_HN.png': zfyTex11,
    'textures/T_actor_zhuangfy_hair_01_P.png': zfyTex12,
  },
};
