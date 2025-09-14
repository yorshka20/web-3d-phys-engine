/**
 * Yaojiayin model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import yaojiayinTex1 from '../../../assets/yaojiayin/hair.bmp?url';
import yaojiayinTex2 from '../../../assets/yaojiayin/skin.bmp?url';
import yaojiayinSph1 from '../../../assets/yaojiayin/spa/hair_s.bmp?url';
import yaojiayinTex4 from '../../../assets/yaojiayin/tex/CD.png?url';
import yaojiayinTex5 from '../../../assets/yaojiayin/tex/CD2.png?url';
import yaojiayinTex6 from '../../../assets/yaojiayin/tex/spa_h.png?url';
import yaojiayinTex7 from '../../../assets/yaojiayin/tex/体.png?url';
import yaojiayinTex12 from '../../../assets/yaojiayin/tex/墨镜.png?url';
import yaojiayinTex8 from '../../../assets/yaojiayin/tex/武器.png?url';
import yaojiayinTex9 from '../../../assets/yaojiayin/tex/肌.png?url';
import yaojiayinTex10 from '../../../assets/yaojiayin/tex/颜.png?url';
import yaojiayinTex11 from '../../../assets/yaojiayin/tex/髮.png?url';
import yaojiayinTex3 from '../../../assets/yaojiayin/toon_defo.bmp?url';

export const yaojiayinDescriptor: PMXAssetDescriptor = {
  modelId: 'yaojiayin',
  pmxPath: 'models/耀嘉音.pmx',
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
    口线: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    白目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    眉: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    二重: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    睫: {
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
    体2: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    饰: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    肌: {
      textures: {
        diffuse: 'tex/肌.png',
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
    墨镜: {
      textures: {
        diffuse: 'tex/墨镜.png',
      },
    },
    墨镜2: {
      textures: {
        diffuse: 'tex/墨镜.png',
      },
    },
  },
  sharedTextures: {
    toon: ['toon_defo.bmp'],
    sphere: ['spa/hair_s.bmp'],
  },
  textureUrlMap: {
    'hair.bmp': yaojiayinTex1,
    'skin.bmp': yaojiayinTex2,
    'toon_defo.bmp': yaojiayinTex3,
    'tex/CD.png': yaojiayinTex4,
    'tex/CD2.png': yaojiayinTex5,
    'tex/spa_h.png': yaojiayinTex6,
    'tex/体.png': yaojiayinTex7,
    'tex/武器.png': yaojiayinTex8,
    'tex/肌.png': yaojiayinTex9,
    'tex/颜.png': yaojiayinTex10,
    'tex/髮.png': yaojiayinTex11,
    'tex/墨镜.png': yaojiayinTex12,
    'spa/hair_s.bmp': yaojiayinSph1,
  },
};
