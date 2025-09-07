import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { mat4 } from 'gl-matrix';
import { Injectable, ServiceTokens } from '../../decorators';
import { BindGroupLayoutVisibility, ShaderType } from '../../types';
import { BaseRenderTask } from '../BaseRenderTask';
import shaderCode from './shader.wgsl?raw';

@Injectable(ServiceTokens.COORDINATE_RENDER_TASK, {
  lifecycle: 'transient',
})
export class CoordinateRenderTask extends BaseRenderTask {
  private coordinateBindGroupLayout!: GPUBindGroupLayout;

  async initialize(): Promise<void> {
    await this.createBuffers();
    await this.createBindGroups();
    await this.compileShaders();
    await this.createRenderPipelines();
  }

  protected getRenderables(frameData: FrameData): RenderData[] {
    // Coordinate axes are always rendered, so return empty array
    // The coordinate axes are rendered independently of renderables
    return [];
  }

  render(renderPassEncoder: GPURenderPassEncoder, frameData: FrameData): void {
    const coordinatePipeline = this.renderPipelineManager.getPipeline('coordinate_render_pipeline');
    if (!coordinatePipeline) {
      throw new Error('[CoordinateRenderTask] Coordinate pipeline not found');
    }

    renderPassEncoder.setPipeline(coordinatePipeline);

    const projectionMatrix = frameData.scene.camera.projectionMatrix;
    const viewMatrix = frameData.scene.camera.viewMatrix;

    // Calculate MVP matrix for coordinate axes
    const modelMatrix = mat4.create(); // Identity matrix for coordinate axes
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
    mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);

    // Update MVP uniform buffer
    const mvpBuffer = this.resourceManager.getBufferResource('Coordinate MVP Buffer');
    this.device.queue.writeBuffer(mvpBuffer.buffer, 0, new Float32Array(mvpMatrix));

    // Use coordinate bind group
    renderPassEncoder.setBindGroup(
      0,
      this.resourceManager.getBindGroupResource('coordinateBindGroup').bindGroup,
    );

    // Set coordinate vertices buffer
    const coordinateVertexBuffer = this.resourceManager.getBufferResource('Coordinate Vertices');
    renderPassEncoder.setVertexBuffer(0, coordinateVertexBuffer.buffer);

    // Draw 6 vertices, 3 lines
    renderPassEncoder.draw(6, 1, 0, 0);
  }

  private async createBuffers(): Promise<void> {
    if (!this.context || !this.bufferManager) {
      throw new Error('WebGPU context or buffer manager not initialized');
    }

    console.log('Creating coordinate axes buffers...');

    // prettier-ignore
    const axesVertices = new Float32Array([
        // x axis - red
        0.0, 0.0, 0.0,  1.0, 0.0, 0.0,  // start, red
        1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  // end, red
        // y axis - green  
        0.0, 0.0, 0.0,  0.0, 1.0, 0.0,  // start, green
        0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  // end, green
        // z axis - blue
        0.0, 0.0, 0.0,  0.0, 0.0, 1.0,  // start, blue
        0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  // end, blue
    ]);

    // Create coordinate vertices buffer with proper usage flags
    this.bufferManager.createVertexBuffer('Coordinate Vertices', axesVertices.buffer);
    console.log('Created and auto-registered: Coordinate Vertices');
  }

  private async createBindGroups(): Promise<void> {
    if (!this.context || !this.resourceManager || !this.timeManager) {
      throw new Error('WebGPU context or resource manager or time manager not initialized');
    }

    // Create MVP uniform buffer for coordinate axes
    // Initialize with identity matrix
    const identityMatrix = new Float32Array(16);
    identityMatrix[0] = 1;
    identityMatrix[5] = 1;
    identityMatrix[10] = 1;
    identityMatrix[15] = 1;
    const mvpBuffer = this.bufferManager.createUniformBuffer(
      'Coordinate MVP Buffer',
      identityMatrix.buffer,
    );

    // Create coordinate bind group layout for MVP matrix
    this.coordinateBindGroupLayout = this.shaderManager.createCustomBindGroupLayout(
      'coordinateBindGroup',
      {
        entries: [
          {
            binding: 0,
            visibility: BindGroupLayoutVisibility.VERTEX,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'CoordinateBindGroup Layout',
      },
    );

    this.shaderManager.createBindGroup('coordinateBindGroup', {
      layout: this.coordinateBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: mvpBuffer,
          },
        },
      ],
      label: 'coordinateBindGroup',
    });

    console.log('Created and auto-registered: coordinateBindGroup');
  }

  private async compileShaders(): Promise<void> {
    if (!this.context || !this.shaderManager) {
      throw new Error('WebGPU context or shader manager not initialized');
    }

    // Create coordinate vertex shader
    this.shaderManager.createShaderModule('coordinateVertex', {
      id: 'coordinateVertex',
      code: shaderCode,
      type: ShaderType.VERTEX,
      entryPoint: 'vs_main',
      label: 'Coordinate Vertex Shader',
    });
    console.log('Created and auto-registered: coordinateVertex shader');

    // Create coordinate fragment shader
    this.shaderManager.createShaderModule('coordinateFragment', {
      id: 'coordinateFragment',
      code: shaderCode,
      type: ShaderType.FRAGMENT,
      entryPoint: 'fs_main',
      label: 'Coordinate Fragment Shader',
    });
    console.log('Created and auto-registered: coordinateFragment shader');
  }

  private async createRenderPipelines(): Promise<void> {
    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.coordinateBindGroupLayout],
      label: 'coordinate_render_pipeline_layout',
    });

    // Create coordinate pipeline
    const pipeline = this.shaderManager.createRenderPipeline('coordinate_render_pipeline', {
      layout: renderPipelineLayout,
      vertex: {
        module: this.resourceManager.getShaderResource('coordinateVertex').shader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 24, // 6 floats * 4 bytes per float (3 position + 3 color)
            attributes: [
              {
                format: 'float32x3',
                offset: 0, // position
                shaderLocation: 0,
              },
              {
                format: 'float32x3',
                offset: 12, // color
                shaderLocation: 1,
              },
            ],
          },
        ],
        constants: {},
      },
      fragment: {
        module: this.resourceManager.getShaderResource('coordinateFragment').shader,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.context.getPreferredFormat(),
          },
        ],
        constants: {},
      },
      primitive: {
        topology: 'line-list',
      },
      depthStencil: {
        depthWriteEnabled: false, // Don't write to depth buffer for coordinate axes
        depthCompare: 'always', // Always pass depth test for coordinate axes
        format: 'depth24plus',
      },
      label: 'coordinate_render_pipeline',
    });

    // Register pipeline
    this.renderPipelineManager.registerPipeline('coordinate_render_pipeline', pipeline);
    console.log('[CoordinateRenderTask] Created and auto-registered: coordinate_render_pipeline');
  }

  destroy(): void {
    // Clean up resources if needed
  }
}
