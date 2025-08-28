import { ShaderType } from '@renderer/webGPU';
import { ShaderManager } from '../../ShaderManager';
import shaderCode from './shader.wgsl?raw';

export function createGeometryShader(shaderManager: ShaderManager) {
  // Create shader modules (auto-registered to resource manager)
  shaderManager.createShaderModule('mainVertex', {
    id: 'mainVertex',
    code: shaderCode,
    type: ShaderType.VERTEX,
    entryPoint: 'vs_main',
    label: 'Example Vertex Shader',
  });
  console.log('Created and auto-registered: mainVertex shader');

  shaderManager.createShaderModule('mainFragment', {
    id: 'mainFragment',
    code: shaderCode,
    type: ShaderType.FRAGMENT,
    entryPoint: 'fs_main',
    label: 'Example Fragment Shader',
  });
  console.log('Created and auto-registered: mainFragment shader');
}
