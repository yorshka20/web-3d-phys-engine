/**
 * Burnice model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import burniceTex1 from '../../../assets/burnice/hair.bmp?url';
import burniceTex2 from '../../../assets/burnice/skin.bmp?url';
import burniceSph1 from '../../../assets/burnice/spa/hair_s.bmp?url';
import burniceTex4 from '../../../assets/burnice/tex/spa_h.png?url';
import burniceTex5 from '../../../assets/burnice/tex/体.png?url';
import burniceTex6 from '../../../assets/burnice/tex/武器.png?url';
import burniceTex7 from '../../../assets/burnice/tex/肌.png?url';
import burniceTex8 from '../../../assets/burnice/tex/颜.png?url';
import burniceTex9 from '../../../assets/burnice/tex/髮.png?url';
import burniceTex10 from '../../../assets/burnice/tex/髮2.png?url';
import burniceTex3 from '../../../assets/burnice/toon_defo.bmp?url';

export const burniceDescriptor: PMXAssetDescriptor = {
  modelId: 'burnice',
  pmxPath: 'models/柏妮思.pmx',
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
    二重: {
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
    白目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    目光: {
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
    武器: {
      textures: {
        diffuse: 'tex/武器.png',
      },
    },
    衣: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    裙: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
    肌: {
      textures: {
        diffuse: 'tex/体.png',
      },
    },
    '肌2+': {
      textures: {
        diffuse: 'tex/髮2.png',
      },
    },
    后髮: {
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
    墨镜: {
      textures: {
        diffuse: 'tex/髮.png',
      },
    },
  },
  sharedTextures: {
    toon: ['toon_defo.bmp'],
    sphere: ['spa/hair_s.bmp'],
  },
  textureUrlMap: {
    'hair.bmp': burniceTex1,
    'skin.bmp': burniceTex2,
    'toon_defo.bmp': burniceTex3,
    'tex/spa_h.png': burniceTex4,
    'tex/体.png': burniceTex5,
    'tex/武器.png': burniceTex6,
    'tex/肌.png': burniceTex7,
    'tex/颜.png': burniceTex8,
    'tex/髮.png': burniceTex9,
    'tex/髮2.png': burniceTex10,
    'spa/hair_s.bmp': burniceSph1,
  },
};
