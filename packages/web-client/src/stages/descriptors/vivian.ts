/**
 * Vivian model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import vivianTex1 from '../../../assets/vivian/hair.bmp?url';
import vivianTex2 from '../../../assets/vivian/skin.bmp?url';
import vivianSph1 from '../../../assets/vivian/spa/hair_s.bmp?url';
import vivianSph2 from '../../../assets/vivian/spa/jewel.png?url';
import vivianSph3 from '../../../assets/vivian/spa/Metal.png?url';
import vivianSph4 from '../../../assets/vivian/spa/stk.png?url';
import vivianTex4 from '../../../assets/vivian/tex/spa_h.png?url';
import vivianTex5 from '../../../assets/vivian/tex/体.png?url';
import vivianTex6 from '../../../assets/vivian/tex/武器.png?url';
import vivianTex7 from '../../../assets/vivian/tex/武器金属.png?url';
import vivianTex8 from '../../../assets/vivian/tex/结晶.png?url';
import vivianTex9 from '../../../assets/vivian/tex/颜.png?url';
import vivianTex10 from '../../../assets/vivian/tex/髮.png?url';
import vivianTex3 from '../../../assets/vivian/toon_defo.bmp?url';

export const vivianDescriptor: PMXAssetDescriptor = {
  modelId: 'vivian',
  pmxPath: 'models/薇薇安.pmx',
  materialDefinitions: {
    颜: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    颜2: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    眉睫: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    目光: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    白目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    口线: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    口舌: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    齿: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    目影: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    体: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    肌: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    体2: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    足: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    髮: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    '髮+': {
      textures: {
        diffuse: 'tex/spa_h.png',
      },
    },
    宝石: {
      textures: {
        diffuse: 'tex/spa_h.png',
      },
    },
  },
  sharedTextures: {
    toon: ['toon_defo.bmp'],
    sphere: ['spa/hair_s.bmp', 'spa/jewel.png', 'spa/Metal.png', 'spa/stk.png'],
  },
  textureUrlMap: {
    'hair.bmp': vivianTex1,
    'skin.bmp': vivianTex2,
    'toon_defo.bmp': vivianTex3,
    'tex/spa_h.png': vivianTex4,
    'tex/体.png': vivianTex5,
    'tex/武器.png': vivianTex6,
    'tex/武器金属.png': vivianTex7,
    'tex/结晶.png': vivianTex8,
    'tex/颜.png': vivianTex9,
    'tex/髮.png': vivianTex10,
    'spa/hair_s.bmp': vivianSph1,
    'spa/jewel.png': vivianSph2,
    'spa/Metal.png': vivianSph3,
    'spa/stk.png': vivianSph4,
  },
};
