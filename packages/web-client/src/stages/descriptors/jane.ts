/**
 * Jane model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import janeTex1 from '../../../assets/jane/skin.bmp?url';
import janeSph1 from '../../../assets/jane/spa/hair_s.bmp?url';
import janeTex3 from '../../../assets/jane/tex/spa_h.png?url';
import janeTex4 from '../../../assets/jane/tex/体.png?url';
import janeTex5 from '../../../assets/jane/tex/武器.png?url';
import janeTex6 from '../../../assets/jane/tex/足.png?url';
import janeTex7 from '../../../assets/jane/tex/颜.png?url';
import janeTex8 from '../../../assets/jane/tex/髮.png?url';
import janeTex2 from '../../../assets/jane/toon_defo.bmp?url';

export const janeDescriptor: PMXAssetDescriptor = {
  modelId: 'jane',
  pmxPath: 'models/简.pmx',
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
    齿: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    口线: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    眉: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    睫: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    二重: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    白目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    口舌: {
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
        diffuse: 'tex/髮.png',
      },
    },
    肌: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    肌2: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    尾: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    髮: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    髮2: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    前髮: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    '髮+': {
      textures: {
        diffuse: 'tex/spa_h.png',
      },
    },
  },
  sharedTextures: {
    toon: ['toon_defo.bmp'],
    sphere: ['spa/hair_s.bmp'],
  },
  textureUrlMap: {
    'skin.bmp': janeTex1,
    'toon_defo.bmp': janeTex2,
    'tex/spa_h.png': janeTex3,
    'tex/体.png': janeTex4,
    'tex/武器.png': janeTex5,
    'tex/足.png': janeTex6,
    'tex/颜.png': janeTex7,
    'tex/髮.png': janeTex8,
    'spa/hair_s.bmp': janeSph1,
  },
};
