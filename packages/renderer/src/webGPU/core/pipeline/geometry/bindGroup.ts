import { TimeManager, WebGPUResourceManager } from '@renderer/webGPU';
import { ShaderManager } from '../../ShaderManager';
import { BindGroupLayoutVisibility } from '../../types';

export function createGeometryBindGroup(
  shaderManager: ShaderManager,
  resourceManager: WebGPUResourceManager,
  timeManager: TimeManager,
) {
  // Create TimeBindGroup layout using shader manager
  const timeBindGroupLayout = shaderManager.createCustomBindGroupLayout('timeBindGroup', {
    entries: [
      {
        binding: 0,
        visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
    label: 'TimeBindGroup Layout',
  });

  shaderManager.createBindGroup('TimeBindGroup', {
    layout: timeBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: timeManager.getBuffer() },
      },
    ],
    label: 'TimeBindGroup',
  });

  console.log('Created and auto-registered: TimeBindGroup');

  // Create MVP matrix bind group layout
  const mvpBindGroupLayout = shaderManager.createCustomBindGroupLayout('mvpBindGroup', {
    entries: [
      {
        binding: 0,
        visibility: BindGroupLayoutVisibility.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
    label: 'MVPBindGroup Layout',
  });

  shaderManager.createBindGroup('MVPBindGroup', {
    layout: mvpBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: resourceManager.getBufferResource('MVP Matrix Uniforms').buffer,
        },
      },
    ],
    label: 'MVPBindGroup',
  });

  console.log('Created and auto-registered: MVPBindGroup');
}
