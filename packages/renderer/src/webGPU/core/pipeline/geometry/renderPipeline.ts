import { WebGPUContext, WebGPUResourceManager } from '@renderer/webGPU';
import { ShaderManager } from '../../ShaderManager';

export function createGeometryRenderPipeline(
  resourceManager: WebGPUResourceManager,
  shaderManager: ShaderManager,
  device: GPUDevice,
  context: WebGPUContext,
) {
  const timeBindGroupLayout = resourceManager.getBindGroupLayoutResource('timeBindGroup');
  const mvpBindGroupLayout = resourceManager.getBindGroupLayoutResource('mvpBindGroup');

  const renderPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [timeBindGroupLayout.layout, mvpBindGroupLayout.layout],
    label: 'render_pipeline_layout',
  });

  const vertexShader = resourceManager.getShaderResource('mainVertex');
  const fragmentShader = resourceManager.getShaderResource('mainFragment');

  // Create simple vertex format pipeline (position only - for cubes)
  shaderManager.createRenderPipeline('main_pipeline', {
    layout: renderPipelineLayout,
    vertex: {
      module: vertexShader.shader,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 32, // 8 floats * 4 bytes per float
          attributes: [
            {
              format: 'float32x3',
              offset: 0, // position
              shaderLocation: 0,
            },
            {
              format: 'float32x3',
              offset: 12, // normal
              shaderLocation: 1,
            },
            {
              format: 'float32x2',
              offset: 24, // uv
              shaderLocation: 2,
            },
          ],
        },
      ],
      constants: {},
    },
    fragment: {
      module: fragmentShader.shader,
      entryPoint: 'fs_main',
      targets: [
        {
          format: context.getPreferredFormat(),
        },
      ],
      constants: {},
    },
    primitive: {
      topology: 'triangle-list',
    },
    label: 'main_render_pipeline',
  });
  console.log('Created and auto-registered: render_pipeline');
}
