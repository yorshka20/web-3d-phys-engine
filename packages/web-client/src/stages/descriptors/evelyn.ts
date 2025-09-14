/**
 * Evelyn model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import evelynTex1 from '../../../assets/evelyn/hair.bmp?url';
import evelynTex2 from '../../../assets/evelyn/skin.bmp?url';
import evelynSph1 from '../../../assets/evelyn/spa/2.bmp?url';
import evelynSph2 from '../../../assets/evelyn/spa/hair_s.bmp?url';
import evelynSph3 from '../../../assets/evelyn/spa/heisi.png?url';
import evelynSph4 from '../../../assets/evelyn/spa/mc1.png?url';
import evelynSph5 from '../../../assets/evelyn/spa/mc3.png?url';
import evelynTex4 from '../../../assets/evelyn/tex/衣.png?url';
import evelynTex5 from '../../../assets/evelyn/tex/衣2.png?url';
import evelynTex6 from '../../../assets/evelyn/tex/衣21.png?url';
import evelynTex7 from '../../../assets/evelyn/tex/颜.png?url';
import evelynTex8 from '../../../assets/evelyn/tex/黑.jpg?url';
import evelynTex3 from '../../../assets/evelyn/toon_defo.bmp?url';

export const evelynDescriptor: PMXAssetDescriptor = {
  modelId: 'evelyn',
  pmxPath: 'models/伊芙琳.pmx',
  materialDefinitions: {
    肌: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    颜: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    痣: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    眉: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    眉睫影: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    白目: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    目: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    目光: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    目光2: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    睫: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    口: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    舌: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    齿: {
      textures: {
        diffuse: 'tex/颜.tga',
      },
    },
    衣: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    外套: {
      textures: {
        diffuse: 'tex/衣2.tga',
      },
    },
    '外套+': {
      textures: {
        diffuse: 'tex/衣2.tga',
      },
    },
    发带: {
      textures: {
        diffuse: 'tex/衣2.tga',
      },
    },
    金属: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    领带: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    '领带+': {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    皮裤: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    衬衣: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    珠宝: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    武器: {
      textures: {
        diffuse: 'tex/衣2.tga',
      },
    },
    黑丝衣: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    穗: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    胸衣: {
      textures: {
        diffuse: 'tex/衣.tga',
      },
    },
    目影: {
      textures: {
        diffuse: 'tex/衣21.tga',
      },
    },
    发: {
      textures: {
        diffuse: 'tex/衣2.tga',
      },
    },
    侧发: {
      textures: {
        diffuse: 'tex/衣2.tga',
      },
    },
    前发: {
      textures: {
        diffuse: 'tex/衣2.tga',
      },
    },
  },
  sharedTextures: {
    toon: ['toon_defo.bmp'],
    sphere: ['spa/hair_s.bmp', 'spa/2.bmp', 'spa/heisi.tga', 'spa/mc1.tga', 'spa/mc3.tga'],
  },
  textureUrlMap: {
    'hair.bmp': evelynTex1,
    'skin.bmp': evelynTex2,
    'toon_defo.bmp': evelynTex3,
    'tex/衣.tga': evelynTex4,
    'tex/衣2.tga': evelynTex5,
    'tex/衣21.tga': evelynTex6,
    'tex/颜.tga': evelynTex7,
    'tex/黑.jpg': evelynTex8,
    'spa/2.bmp': evelynSph1,
    'spa/hair_s.bmp': evelynSph2,
    'spa/heisi.tga': evelynSph3,
    'spa/mc1.tga': evelynSph4,
    'spa/mc3.tga': evelynSph5,
  },
};
