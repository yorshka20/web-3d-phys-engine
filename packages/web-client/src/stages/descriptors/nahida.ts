/**
 * Nahida model asset descriptor
 * Based on actual PMX file material and texture information
 */

import { PMXAssetDescriptor } from '@renderer/webGPU/core/PMXAssetDescriptor';

// Import texture URLs
import nahidaTex1 from '../../../assets/nahida/hair.bmp?url';
import nahidaTex2 from '../../../assets/nahida/skin.bmp?url';
import nahidaSph1 from '../../../assets/nahida/sph/hair_s.bmp?url';
import nahidaSph2 from '../../../assets/nahida/sph/s1.bmp?url';
import nahidaTex8 from '../../../assets/nahida/tex/spa_h.png?url';
import nahidaTex6 from '../../../assets/nahida/tex/体1.png?url';
import nahidaTex7 from '../../../assets/nahida/tex/肌.png?url';
import nahidaTex4 from '../../../assets/nahida/tex/颜.png?url';
import nahidaTex5 from '../../../assets/nahida/tex/髮1.png?url';
import nahidaTex3 from '../../../assets/nahida/toon_defo.bmp?url';

export const nahidaDescriptor: PMXAssetDescriptor = {
  modelId: 'nahida',
  pmxPath: 'models/nahida.pmx',
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
    口舌: {
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
    目: {
      textures: {
        diffuse: 'tex/髮1.png',
      },
    },
    白目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    星目: {
      textures: {
        diffuse: 'tex/颜.png',
      },
    },
    髮: {
      textures: {
        diffuse: 'tex/髮1.png',
      },
    },
    前髮: {
      textures: {
        diffuse: 'tex/髮1.png',
      },
    },
    头饰: {
      textures: {
        diffuse: 'tex/髮1.png',
      },
    },
    体: {
      textures: {
        diffuse: 'tex/体1.png',
      },
    },
    短裤: {
      textures: {
        diffuse: 'tex/体1.png',
      },
    },
    体饰: {
      textures: {
        diffuse: 'tex/髮1.png',
      },
    },
    肌: {
      textures: {
        diffuse: 'tex/肌.png',
      },
    },
    肌2: {
      textures: {
        diffuse: 'tex/体1.png',
      },
    },
    裙: {
      textures: {
        diffuse: 'tex/体1.png',
      },
    },
    裙2: {
      textures: {
        diffuse: 'tex/体1.png',
      },
    },
    披风饰: {
      textures: {
        diffuse: 'tex/体1.png',
      },
    },
    披风: {
      textures: {
        diffuse: 'tex/髮1.png',
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
    sphere: ['sph/hair_s.bmp', 'sph/s1.bmp'],
  },
  textureUrlMap: {
    'hair.bmp': nahidaTex1,
    'skin.bmp': nahidaTex2,
    'toon_defo.bmp': nahidaTex3,
    'tex/颜.png': nahidaTex4,
    'tex/髮1.png': nahidaTex5,
    'tex/体1.png': nahidaTex6,
    'tex/肌.png': nahidaTex7,
    'tex/spa_h.png': nahidaTex8,
    'sph/hair_s.bmp': nahidaSph1,
    'sph/s1.bmp': nahidaSph2,
  },
};
