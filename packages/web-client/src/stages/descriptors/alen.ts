/**
 * Alen model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import alenTex1 from '../../../assets/alen/hair.bmp?url';
import alenTex2 from '../../../assets/alen/skin.bmp?url';
import alenSph1 from '../../../assets/alen/spa/hair_s.bmp?url';
import alenTex4 from '../../../assets/alen/tex/sh.png?url';
import alenTex5 from '../../../assets/alen/tex/体.png?url';
import alenTex6 from '../../../assets/alen/tex/武器.png?url';
import alenTex7 from '../../../assets/alen/tex/颜.png?url';
import alenTex8 from '../../../assets/alen/tex/髮.png?url';
import alenTex3 from '../../../assets/alen/toon_defo.bmp?url';

export const alenDescriptor: PMXAssetDescriptor = {
  modelId: 'alen',
  pmxPath: 'models/艾莲.pmx',
  materialDefinitions: {
    颜: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    颜2: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    眉: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    白目: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    口舌: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    齿: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    目: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    口线: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    睫: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    二重影: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    二重: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    体: {
      textures: {
        diffuse: 'tex/体.tga',
      },
    },
    带: {
      textures: {
        diffuse: 'tex/体.tga',
      },
    },
    尾: {
      textures: {
        diffuse: 'tex/体.tga',
      },
    },
    肌: {
      textures: {
        diffuse: 'tex/体.tga',
      },
    },
    髮: {
      textures: {
        diffuse: 'tex/髮.tga',
      },
    },
    头饰: {
      textures: {
        diffuse: 'tex/髮.tga',
      },
    },
    足: {
      textures: {
        diffuse: 'tex/髮.tga',
      },
    },
    '髮+': {
      textures: {
        diffuse: 'tex/sh.png',
      },
    },
  },
  sharedTextures: {
    toon: ['toon_defo.bmp'],
    sphere: ['spa/hair_s.bmp'],
  },
  textureUrlMap: {
    'hair.bmp': alenTex1,
    'skin.bmp': alenTex2,
    'toon_defo.bmp': alenTex3,
    'tex/sh.png': alenTex4,
    'tex/体.tga': alenTex5,
    'tex/武器.tga': alenTex6,
    'tex/颜.tga': alenTex7,
    'tex/髮.tga': alenTex8,
    'spa/hair_s.bmp': alenSph1,
  },
};
