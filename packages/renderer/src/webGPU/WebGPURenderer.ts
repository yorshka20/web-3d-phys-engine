import { RectArea, SystemPriorities } from '@ecs';
import { mat4 } from 'gl-matrix';
import { ContextConfig, IWebGPURenderer } from '../types';
import {
  BindGroupLayoutVisibility,
  ShaderType,
  TimeManager,
  WebGPUContext,
  WebGPUResourceManager,
} from './core';
import { BufferManager } from './core/BufferManager';
import { InstanceManager } from './core/InstanceManager';
import { ShaderManager } from './core/ShaderManager';
import { TextureManager } from './core/TextureManager';
import {
  BufferDescriptor,
  PipelineDescriptor,
  RenderBatch,
  RenderContext,
  TextureDescriptor,
} from './types';

/**
 * WebGPU Renderer
 *
 * Responsibilities:
 * - WebGPU Device and context management
 * - GPU resource lifecycle management
 * - Implementation of specific rendering logic
 * - Management of render pipelines and shaders
 */
export class WebGPURenderer implements IWebGPURenderer {
  enabled = true;
  debug = false;
  priority = SystemPriorities.RENDER;

  private canvas!: HTMLCanvasElement;
  private context!: WebGPUContext;

  private viewport!: RectArea;
  private frameCount = 0;

  private renderContext!: RenderContext;

  // shaders and pipelines
  private pipelines!: Map<string, GPURenderPipeline>;
  private shaders!: Map<string, GPUShaderModule>;

  // resource managers
  private bufferManager!: BufferManager;
  private shaderManager!: ShaderManager;
  private textureManager!: TextureManager;
  private resourceManager!: WebGPUResourceManager;
  private timeManager!: TimeManager;

  // batch rendering
  private renderBatches!: Map<string, RenderBatch>;
  private instanceManager!: InstanceManager;

  private get device(): GPUDevice {
    return this.context.getDevice();
  }

  constructor(
    protected rootElement: HTMLElement,
    private name: string,
  ) {
    const width = rootElement.clientWidth;
    const height = rootElement.clientHeight;
    const dpr = this.getDPR();
    this.viewport = [0, 0, width * dpr, height * dpr];
    // this.updateContextConfig({ width, height, dpr });
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;

    // init webgpu
    await this.initializeWebGPU();

    // init resource managers
    this.bufferManager = new BufferManager(this.device);
    this.textureManager = new TextureManager(this.device);
    this.shaderManager = new ShaderManager(this.device);
    // TODO: can remove this
    this.resourceManager = new WebGPUResourceManager(this.device);
    this.timeManager = new TimeManager(this.device, this.bufferManager);

    await this.setupScene();

    // create render pipelines
    await this.createRenderPipelines();
  }

  private async setupScene(): Promise<void> {
    await this.createBuffers();
    await this.createBindGroups();
    await this.compileShaders();
  }

  private async createBuffers(): Promise<void> {
    if (!this.context || !this.bufferManager) {
      throw new Error('WebGPU context or buffer manager not initialized');
    }
    if (!this.resourceManager) {
      throw new Error('WebGPU resource manager not initialized');
    }

    console.log('Creating example buffers...');

    // vertex buffer for cube
    // prettier-ignore
    const vertexData = new Float32Array([
      // Front face
      -0.5, -0.5, 0.5,  // 0
      0.5, -0.5, 0.5,  // 1
      0.5, 0.5, 0.5,   // 2
      -0.5, 0.5, 0.5,  // 3

      // Back face
      -0.5, -0.5, -0.5, // 4
      -0.5, 0.5, -0.5,  // 5
      0.5, 0.5, -0.5,   // 6
      0.5, -0.5, -0.5,  // 7

      // Top face
      -0.5, 0.5, -0.5,  // 8
      -0.5, 0.5, 0.5,   // 9
      0.5, 0.5, 0.5,    // 10
      0.5, 0.5, -0.5,   // 11

      // Bottom face
      -0.5, -0.5, -0.5, // 12
      0.5, -0.5, -0.5,  // 13
      0.5, -0.5, 0.5,   // 14
      -0.5, -0.5, 0.5,  // 15

      // Right face
      0.5, -0.5, -0.5,  // 16
      0.5, 0.5, -0.5,   // 17
      0.5, 0.5, 0.5,    // 18
      0.5, -0.5, 0.5,   // 19

      // Left face
      -0.5, -0.5, -0.5, // 20
      -0.5, -0.5, 0.5,  // 21
      -0.5, 0.5, 0.5,   // 22
      -0.5, 0.5, -0.5,  // 23
    ]);

    this.bufferManager?.createVertexBuffer(vertexData.buffer, 'Cube Vertices');
    const vertexBuffer = this.bufferManager.getVertexBuffer('Cube Vertices');
    if (vertexBuffer) {
      this.resourceManager.registerResource('Cube Vertices', vertexBuffer);
      console.log('Registered resource: Cube Vertices');
    }

    // index buffer for cube
    // prettier-ignore
    const indexData = new Uint16Array([
      0, 1, 2, 2, 3, 0,    // Front face
      4, 5, 6, 6, 7, 4,    // Back face
      8, 9, 10, 10, 11, 8, // Top face
      12, 13, 14, 14, 15, 12, // Bottom face
      16, 17, 18, 18, 19, 16, // Right face
      20, 21, 22, 22, 23, 20, // Left face
    ]);

    this.bufferManager?.createIndexBuffer(indexData.buffer, 'Cube Indices');
    const indexBuffer = this.bufferManager.getIndexBuffer('Cube Indices');
    if (indexBuffer) {
      this.resourceManager.registerResource('Cube Indices', indexBuffer);
      console.log('Registered resource: Cube Indices');
    }

    // uniform buffer for MVP matrix
    // 4x4 matrix, 16 floats. Initialized to identity.
    // prettier-ignore
    const mvpMatrixData = new Float32Array([
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0,
    ]);

    this.bufferManager?.createUniformBuffer(mvpMatrixData.buffer, 'MVP Matrix Uniforms');
    const mvpUniformBuffer = this.bufferManager.getUniformBuffer('MVP Matrix Uniforms');
    if (mvpUniformBuffer) {
      this.resourceManager.registerResource('MVP Matrix Uniforms', mvpUniformBuffer);
      console.log('Registered resource: MVP Matrix Uniforms');
    }
  }

  private async createBindGroups(): Promise<void> {
    if (!this.context || !this.resourceManager || !this.timeManager) {
      throw new Error('WebGPU context or resource manager or time manager not initialized');
    }

    // Create time bind group layout using shader manager
    const timeBindGroupLayout = this.shaderManager.createCustomBindGroupLayout('timeBindGroup', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'Time Bind Group Layout',
    });
    this.resourceManager.registerResource('timeBindGroup', timeBindGroupLayout);

    // Create MVP matrix bind group layout
    const mvpBindGroupLayout = this.shaderManager.createCustomBindGroupLayout('mvpBindGroup', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'MVP Bind Group Layout',
    });
    this.resourceManager.registerResource('mvpBindGroup', mvpBindGroupLayout);

    const timeBindGroup = this.device.createBindGroup({
      layout: timeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.timeManager.getBuffer() },
        },
      ],
      label: 'Time Bind Group',
    });
    this.resourceManager.registerResource('Time Bind Group', timeBindGroup);
    console.log('Registered resource: Time Bind Group');

    const mvpBindGroup = this.device.createBindGroup({
      layout: mvpBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.resourceManager.getResource<GPUBuffer>('MVP Matrix Uniforms'),
          },
        },
      ],
      label: 'MVP Bind Group',
    });
    this.resourceManager.registerResource('MVP Bind Group', mvpBindGroup);
    console.log('Registered resource: MVP Bind Group');
  }

  private async compileShaders(): Promise<void> {
    if (!this.context || !this.shaderManager) {
      throw new Error('WebGPU context or shader manager not initialized');
    }
    if (!this.resourceManager) {
      throw new Error('WebGPU resource manager not initialized');
    }

    const shaderCode = `
      struct TimeUniforms {
        time: f32,
        deltaTime: f32,
        frameCount: u32,
        padding: u32,
      }
      
      struct MVPUniforms {
        mvpMatrix: mat4x4<f32>,
      }

      struct VertexInput {
        @location(0) position: vec3<f32>
      }

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec4<f32>
      }

      @group(0) @binding(0) var<uniform> timeData: TimeUniforms;
      @group(1) @binding(0) var<uniform> mvp: MVPUniforms;

      @vertex
      fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
        var out: VertexOutput;
        out.position = mvp.mvpMatrix * vec4<f32>(position, 1.0);
        out.color = vec4<f32>(position + 0.5, 1.0);
        return out;
      }

      @fragment
      fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
        let t = timeData.time;
        
        // pulse effect
        let pulse = sin(t * 2.0) * 0.5 + 0.5;
        
        // rainbow color change
        let hue = (t * 0.5) % 1.0;
        let animatedColor = hsv_to_rgb(vec3<f32>(hue, 1.0, 1.0));
        
        // wave effect based on vertex position
        let dist = length(color.xy - vec2<f32>(0.5));
        let wave = sin(dist * 10.0 - t * 5.0) * 0.5 + 0.5;
        
        // combine vertex color with animated effects
        return vec4<f32>(animatedColor * wave * pulse, color.w);
      }

      // HSV to RGB helper function
      fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
        let c = hsv.z * hsv.y;
        let x = c * (1.0 - abs((hsv.x * 6.0) % 2.0 - 1.0));
        let m = hsv.z - c;
        
        var rgb: vec3<f32>;
        if (hsv.x < 1.0/6.0) { rgb = vec3<f32>(c, x, 0.0); }
        else if (hsv.x < 2.0/6.0) { rgb = vec3<f32>(x, c, 0.0); }
        else if (hsv.x < 3.0/6.0) { rgb = vec3<f32>(0.0, c, x); }
        else if (hsv.x < 4.0/6.0) { rgb = vec3<f32>(0.0, x, c); }
        else if (hsv.x < 5.0/6.0) { rgb = vec3<f32>(x, 0.0, c); }
        else { rgb = vec3<f32>(c, 0.0, x); }
        
        return rgb + vec3<f32>(m);
      }
    `;

    // Create shader modules
    const vertexShader = this.shaderManager.createShaderModule('exampleVertex', {
      code: shaderCode,
      type: ShaderType.VERTEX,
      entryPoint: 'vs_main',
      label: 'Example Vertex Shader',
    });
    this.resourceManager.registerResource('exampleVertex', vertexShader);

    const fragmentShader = this.shaderManager.createShaderModule('exampleFragment', {
      code: shaderCode,
      type: ShaderType.FRAGMENT,
      entryPoint: 'fs_main',
      label: 'Example Fragment Shader',
    });
    this.resourceManager.registerResource('exampleFragment', fragmentShader);
  }

  private async createRenderPipelines(): Promise<void> {
    const timeBindGroupLayout =
      this.resourceManager.getResource<GPUBindGroupLayout>('timeBindGroup');
    const mvpBindGroupLayout = this.resourceManager.getResource<GPUBindGroupLayout>('mvpBindGroup');

    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [timeBindGroupLayout, mvpBindGroupLayout],
      label: 'render_pipeline_layout',
    });

    const vertexShader = this.resourceManager.getResource<GPUShaderModule>('exampleVertex');
    const fragmentShader = this.resourceManager.getResource<GPUShaderModule>('exampleFragment');

    // create render pipeline
    const renderPipeline = this.shaderManager.createRenderPipeline('example', {
      layout: renderPipelineLayout,
      vertex: {
        module: vertexShader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 12, // 3 floats * 4 bytes per float
            attributes: [
              {
                format: 'float32x3',
                offset: 0,
                shaderLocation: 0,
              },
            ],
          },
        ],
        constants: {},
      },
      fragment: {
        module: fragmentShader,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.context.getPreferredFormat(),
          },
        ],
        constants: {},
      },
      primitive: {
        topology: 'triangle-list',
      },
      label: 'example_render_pipeline',
    });
    if (renderPipeline) {
      this.resourceManager.registerResource('example_render_pipeline', renderPipeline);
      console.log('Registered resource: example_render_pipeline');
    }
  }

  private async initializeWebGPU(): Promise<void> {
    this.context = new WebGPUContext();
    await this.context.initialize(this.canvas, {
      powerPreference: 'high-performance',
      requiredFeatures: ['timestamp-query'],
      requiredLimits: {
        maxStorageBufferBindingSize: 1024 * 1024 * 64, // 64MB
        maxComputeWorkgroupStorageSize: 32768,
      },
    });
  }

  private getDPR(): number {
    return window.devicePixelRatio;
  }

  /**
   * Main render loop
   */
  render(deltaTime: number, context: RenderContext): void {
    if (
      !this.context ||
      !this.shaderManager ||
      !this.timeManager ||
      !this.bufferManager ||
      !this.resourceManager
    ) {
      console.warn('WebGPU not initialized');
      return;
    }

    try {
      // update time
      this.timeManager.updateTime();

      // create time bind group
      const timeBuffer = this.timeManager.getBuffer();
      const timeBindGroup = this.resourceManager.getResource<GPUBindGroup>('Time Bind Group');

      // Update MVP matrix
      const now = performance.now() / 1000;
      const aspectRatio = this.canvas.width / this.canvas.height;

      const projectionMatrix = mat4.create();
      mat4.perspective(
        projectionMatrix,
        (2 * Math.PI) / 5, // fovy
        aspectRatio,
        0.1,
        100.0,
      );
      const viewMatrix = mat4.create();
      mat4.lookAt(
        viewMatrix,
        [0, 0, -5], // eye
        [0, 0, 0], // center
        [0, 1, 0], // up
      );

      let modelMatrix = mat4.create();
      mat4.rotateY(modelMatrix, modelMatrix, now * 0.5);
      mat4.rotateX(modelMatrix, modelMatrix, now * 0.3);

      const mvpMatrix = mat4.create();
      mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
      mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

      const mvpBuffer = this.resourceManager.getResource<GPUBuffer>('MVP Matrix Uniforms');
      if (mvpBuffer) {
        // Write the MVP matrix to the uniform buffer as Float32Array
        this.device.queue.writeBuffer(mvpBuffer, 0, new Float32Array(mvpMatrix));
      }

      // Create MVP bind group
      const mvpBindGroup = this.resourceManager.getResource<GPUBindGroup>('MVP Bind Group');

      // create command encoder
      const commandEncoder = this.device.createCommandEncoder();

      // begin render pass
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.context.getContext().getCurrentTexture().createView(),
            clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });

      // set render pipeline
      const pipeline =
        this.resourceManager.getResource<GPURenderPipeline>('example_render_pipeline');
      if (pipeline) {
        renderPass.setPipeline(pipeline);

        // set vertex buffer
        const vertexBuffer = this.resourceManager.getResource<GPUBuffer>('Cube Vertices');
        if (vertexBuffer) {
          renderPass.setVertexBuffer(0, vertexBuffer);
        }
        const indexBuffer = this.resourceManager.getResource<GPUBuffer>('Cube Indices');
        if (indexBuffer) {
          renderPass.setIndexBuffer(indexBuffer, 'uint16');
        }

        renderPass.setBindGroup(0, timeBindGroup);
        renderPass.setBindGroup(1, mvpBindGroup);

        // draw cube
        renderPass.drawIndexed(36);
      }

      renderPass.end();

      // set compute pipeline
      // const computePass = commandEncoder.beginComputePass();
      // const computePipeline = this.resourceManager.getResource<GPUComputePipeline>(
      //   'example_compute_pipeline',
      // );

      // if (computePipeline) {
      //   computePass.setPipeline(computePipeline);

      //   // Create and set bind group for compute pipeline
      //   const computeBindGroup =
      //     this.resourceManager.getResource<GPUBindGroup>('Compute Bind Group');
      //   computePass.setBindGroup(0, computeBindGroup);

      //   computePass.dispatchWorkgroups(1, 1, 1);
      // }
      // computePass.end();

      // submit command
      this.device.queue.submit([commandEncoder.finish()]);

      // Read compute pipeline results every few frames
      // if (this.frameCount % 60 === 0) {
      //   this.readComputeResults();
      // }

      // Increment frame counter
      this.frameCount++;

      // Continue the loop
      requestAnimationFrame(() => this.render(deltaTime, context));
    } catch (error) {
      console.error('Render loop error:', error);
    }
  }

  getDevice(): GPUDevice {
    return this.device;
  }

  createBuffer(descriptor: BufferDescriptor): string {
    throw new Error('Method not implemented.');
  }
  createTexture(descriptor: TextureDescriptor): string {
    throw new Error('Method not implemented.');
  }
  createPipeline(descriptor: PipelineDescriptor): string {
    throw new Error('Method not implemented.');
  }
  updateBuffer(id: string, data: ArrayBuffer): void {
    throw new Error('Method not implemented.');
  }
  updateTexture(id: string, data: ImageData | HTMLImageElement): void {
    throw new Error('Method not implemented.');
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    throw new Error('Method not implemented.');
  }

  updateContextConfig(config: ContextConfig): void {
    throw new Error('Method not implemented.');
  }
  setBackgroundImage(image: HTMLImageElement): void {
    throw new Error('Method not implemented.');
  }
  clear(): void {
    // do nothing
  }

  onResize(): void {
    throw new Error('Method not implemented.');
  }
  onDestroy(): void {
    throw new Error('Method not implemented.');
  }
}
