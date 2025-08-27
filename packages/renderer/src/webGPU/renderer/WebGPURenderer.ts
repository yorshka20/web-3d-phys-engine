import { RectArea, SystemPriorities } from '@ecs';
import chroma from 'chroma-js';
import { mat4 } from 'gl-matrix';
import {
  BindGroupLayoutVisibility,
  ShaderType,
  TimeManager,
  WebGPUContext,
  WebGPUResourceManager,
} from '../core';
import { BufferManager } from '../core/BufferManager';
import {
  GeometryCacheItem,
  GeometryManager,
  GeometryParams,
  GeometryType,
} from '../core/GeometryManager';
import { InstanceManager } from '../core/InstanceManager';
import { ShaderManager } from '../core/ShaderManager';
import { TextureManager } from '../core/TextureManager';
import { BufferDescriptor, RenderBatch, ShaderDescriptor } from '../core/types';
import { RenderContext } from '../types';
import {
  BindGroup,
  Camera,
  ComputePass,
  ComputePassDescriptor,
  ContextConfig,
  Geometry,
  IWebGPURenderer,
  Material,
  MaterialDescriptor,
  Mesh,
  PostProcessEffect,
  RenderPass,
  RenderPassDescriptor,
  RenderPipeline,
  Scene,
  Texture,
} from './types/IWebGPURenderer';

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
  private aspectRatio = 1;

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
  private geometryManager!: GeometryManager;

  // batch rendering
  private renderBatches!: Map<string, RenderBatch>;
  private instanceManager!: InstanceManager;

  // Multiple geometry instances
  private geometryInstances: Array<{
    geometry: GeometryCacheItem;
    transform: mat4;
    scale: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    mvpBuffer: GPUBuffer;
    mvpBindGroup: GPUBindGroup;
  }> = [];

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
    this.aspectRatio = width / height;
    // this.updateContextConfig({ width, height, dpr });
  }
  destroy(): void {
    // Clean up all managers
    if (this.bufferManager) {
      this.bufferManager.onDestroy();
    }
    if (this.shaderManager) {
      this.shaderManager.onDestroy();
    }
    if (this.textureManager) {
      this.textureManager.onDestroy();
    }
    if (this.context) {
      this.context.destroy();
    }

    console.log('WebGPURenderer destroyed');
  }
  getContext(): GPUCanvasContext {
    return this.context.getContext();
  }
  getAdapter(): GPUAdapter {
    return this.context.getAdapter();
  }
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
    return this.device.createRenderPipeline(descriptor);
  }
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    return this.device.createComputePipeline(descriptor);
  }
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
    return this.device.createBindGroupLayout(descriptor);
  }
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup {
    return this.device.createBindGroup(descriptor);
  }
  destroyBuffer(bufferId: string): void {
    const buffer = this.bufferManager.getBufferByLabel(bufferId);
    if (buffer) {
      this.bufferManager.destroyBuffer(buffer);
    } else {
      console.warn(`Buffer not found: ${bufferId}`);
    }
  }
  destroyTexture(textureId: string): void {
    // Texture destruction handled by TextureManager
    console.warn('Texture destruction not implemented yet');
  }
  destroyShader(shaderId: string): void {
    this.shaderManager.reloadShader(shaderId, '');
  }
  renderScene(scene: Scene, camera: Camera): void {
    throw new Error('Method not implemented.');
  }
  renderEntity(entityId: number, world: unknown): void {
    throw new Error('Method not implemented.');
  }
  createMaterial(descriptor: MaterialDescriptor): Material {
    throw new Error('Method not implemented.');
  }
  createTexture(data: ImageData | HTMLImageElement): Texture {
    throw new Error('Method not implemented.');
  }
  createMesh(geometry: Geometry): Mesh {
    throw new Error('Method not implemented.');
  }
  addPostProcessEffect(effect: PostProcessEffect): void {
    throw new Error('Method not implemented.');
  }
  removePostProcessEffect(effectId: string): void {
    throw new Error('Method not implemented.');
  }
  beginFrame(): void {
    // Update time manager
    this.timeManager.updateTime();

    // Begin frame for buffer manager
    this.bufferManager.beginFrame();

    // Clean up frame resources
    this.bufferManager.cleanupFrameResources();
    this.shaderManager.cleanupFrameResources();
  }
  endFrame(): void {
    // End frame for buffer manager
    this.bufferManager.endFrame();

    // Increment frame counter
    this.frameCount++;
  }
  destroyMaterial(materialId: string): void {
    throw new Error('Method not implemented.');
  }
  destroyMesh(meshId: string): void {
    throw new Error('Method not implemented.');
  }
  beginRenderPass(descriptor: RenderPassDescriptor): RenderPass {
    throw new Error('Method not implemented.');
  }
  beginComputePass(descriptor?: ComputePassDescriptor): ComputePass {
    throw new Error('Method not implemented.');
  }
  setRenderPipeline(pipeline: RenderPipeline): void {
    throw new Error('Method not implemented.');
  }
  setComputePipeline(pipeline: GPUComputePipeline): void {
    throw new Error('Method not implemented.');
  }
  setBindGroup(index: number, bindGroup: BindGroup): void {
    throw new Error('Method not implemented.');
  }
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    throw new Error('Method not implemented.');
  }
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void {
    throw new Error('Method not implemented.');
  }
  dispatch(x: number, y?: number, z?: number): void {
    throw new Error('Method not implemented.');
  }
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void {
    throw new Error('Method not implemented.');
  }
  setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat, offset?: number, size?: number): void {
    throw new Error('Method not implemented.');
  }
  submit(): void {
    throw new Error('Method not implemented.');
  }
  getRenderStats(): {
    frameTime: number;
    drawCalls: number;
    triangles: number;
    memoryUsage: { buffers: number; textures: number; total: number };
  } {
    const bufferStats = this.bufferManager.getMemoryUsage();
    const shaderStats = this.shaderManager.getShaderStats();

    return {
      frameTime: 0, // TODO: implement frame time tracking
      drawCalls: this.geometryInstances.length,
      triangles: this.geometryInstances.length * 12, // 12 triangles per cube
      memoryUsage: {
        buffers: Object.values(bufferStats).reduce((a, b) => a + b, 0),
        textures: 0, // TODO: implement texture memory tracking
        total: Object.values(bufferStats).reduce((a, b) => a + b, 0),
      },
    };
  }
  setDebugMode(enabled: boolean): void {
    this.debug = enabled;
    console.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }
  getDebugInfo(): {
    deviceInfo: GPUAdapterInfo;
    supportedFeatures: string[];
    limits: Record<string, number>;
  } {
    const adapter = this.context.getAdapter();
    return {
      deviceInfo: adapter.info,
      supportedFeatures: Array.from(this.device.features),
      limits: Object.fromEntries(
        Object.entries(this.device.limits).map(([key, value]) => [key, Number(value)]),
      ),
    };
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;

    // init webgpu
    await this.initializeWebGPU();

    // init resource managers
    this.resourceManager = new WebGPUResourceManager();
    this.bufferManager = new BufferManager(this.device);
    this.textureManager = new TextureManager(this.device);
    this.shaderManager = new ShaderManager(this.device);
    this.timeManager = new TimeManager(this.device, this.bufferManager);
    this.geometryManager = new GeometryManager(this.bufferManager);

    await this.setupScene();

    // setup multiple geometry instances
    this.setupGeometryInstances();

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
    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }

    console.log('Creating example buffers...');

    // Use geometry manager to create unit cube data
    const cubeGeometry = this.geometryManager.createCube();

    // Create vertex buffer (auto-registered to resource manager)
    this.bufferManager.createVertexBuffer('Cube Vertices', cubeGeometry.geometry.vertices.buffer);
    console.log('Created and auto-registered: Cube Vertices');

    // Create index buffer (auto-registered to resource manager)
    this.bufferManager.createIndexBuffer('Cube Indices', cubeGeometry.geometry.indices.buffer);
    console.log('Created and auto-registered: Cube Indices');

    // Create uniform buffer for MVP matrix (auto-registered to resource manager)
    // 4x4 matrix, 16 floats. Initialized to identity.
    // prettier-ignore
    const mvpMatrixData = new Float32Array([
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0,
    ]);

    this.bufferManager.createUniformBuffer('MVP Matrix Uniforms', mvpMatrixData.buffer);
    console.log('Created and auto-registered: MVP Matrix Uniforms');
  }

  private async createBindGroups(): Promise<void> {
    if (!this.context || !this.resourceManager || !this.timeManager) {
      throw new Error('WebGPU context or resource manager or time manager not initialized');
    }

    // Create TimeBindGroup layout using shader manager
    const timeBindGroupLayout = this.shaderManager.createCustomBindGroupLayout('timeBindGroup', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'TimeBindGroup Layout',
    });

    this.shaderManager.createBindGroup('TimeBindGroup', {
      layout: timeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.timeManager.getBuffer() },
        },
      ],
      label: 'TimeBindGroup',
    });

    console.log('Created and auto-registered: TimeBindGroup');

    // Create MVP matrix bind group layout
    const mvpBindGroupLayout = this.shaderManager.createCustomBindGroupLayout('mvpBindGroup', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'MVPBindGroup Layout',
    });

    this.shaderManager.createBindGroup('MVPBindGroup', {
      layout: mvpBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.resourceManager.getBufferResource('MVP Matrix Uniforms').buffer,
          },
        },
      ],
      label: 'MVPBindGroup',
    });

    console.log('Created and auto-registered: MVPBindGroup');
  }

  private async compileShaders(): Promise<void> {
    if (!this.context || !this.shaderManager) {
      throw new Error('WebGPU context or shader manager not initialized');
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

    // Create shader modules (auto-registered to resource manager)
    this.shaderManager.createShaderModule('exampleVertex', {
      id: 'exampleVertex',
      code: shaderCode,
      type: ShaderType.VERTEX,
      entryPoint: 'vs_main',
      label: 'Example Vertex Shader',
    });
    console.log('Created and auto-registered: exampleVertex shader');

    this.shaderManager.createShaderModule('exampleFragment', {
      id: 'exampleFragment',
      code: shaderCode,
      type: ShaderType.FRAGMENT,
      entryPoint: 'fs_main',
      label: 'Example Fragment Shader',
    });
    console.log('Created and auto-registered: exampleFragment shader');
  }

  private async createRenderPipelines(): Promise<void> {
    const timeBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('timeBindGroup');
    const mvpBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroup');

    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [timeBindGroupLayout.layout, mvpBindGroupLayout.layout],
      label: 'render_pipeline_layout',
    });

    const vertexShader = this.resourceManager.getShaderResource('exampleVertex');
    const fragmentShader = this.resourceManager.getShaderResource('exampleFragment');

    // Create render pipeline (auto-registered to resource manager)
    this.shaderManager.createRenderPipeline('example', {
      layout: renderPipelineLayout, // declare bind group layout
      vertex: {
        module: vertexShader.shader,
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
        module: fragmentShader.shader,
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
    console.log('Created and auto-registered: example_render_pipeline');
  }

  /**
   * Setup multiple geometry instances with different transforms
   */
  private setupGeometryInstances(): void {
    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }

    // Get MVPBindGroup layout for creating individual bind groups
    const mvpBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroup');
    if (!mvpBindGroupLayout) {
      throw new Error('MVPBindGroup layout not found');
    }

    // Create three cubes with different positions, scales, and rotations
    const cube1 = this.geometryManager.createCube();
    const cube2 = this.geometryManager.createCube();
    const cube3 = this.geometryManager.createCube();

    // Create individual MVP buffers and bind groups for each instance
    const createInstance = (
      geometry: any,
      scale: [number, number, number],
      position: [number, number, number],
      rotation: [number, number, number],
      instanceName: string,
    ) => {
      // Create individual MVP buffer for this instance
      const mvpBuffer = this.device.createBuffer({
        size: 64, // 4x4 matrix * 4 bytes per float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: `MVP Buffer ${instanceName}`,
      });

      // Create individual MVPBindGroup for this instance
      const mvpBindGroup = this.device.createBindGroup({
        layout: mvpBindGroupLayout.layout,
        entries: [
          {
            binding: 0,
            resource: { buffer: mvpBuffer },
          },
        ],
        label: `MVPBindGroup ${instanceName}`,
      });

      return {
        geometry,
        transform: mat4.create(),
        scale,
        position,
        rotation,
        mvpBuffer,
        mvpBindGroup,
      };
    };

    // Cube 1: Small cube on the left
    this.geometryInstances.push(
      createInstance(cube1, [0.5, 0.5, 0.5], [-2, 0, 0], [0, 0, 0], 'Cube1'),
    );

    // Cube 2: Medium cube in the center
    this.geometryInstances.push(
      createInstance(cube2, [1.0, 1.0, 1.0], [0, 0, 0], [0, Math.PI / 4, 0], 'Cube2'),
    );

    // Cube 3: Large cube on the right
    this.geometryInstances.push(
      createInstance(cube3, [1.5, 1.5, 1.5], [2, 0, 0], [Math.PI / 6, 0, Math.PI / 6], 'Cube3'),
    );

    console.log('Setup 3 geometry instances with different transforms and individual MVP buffers');
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
      // Begin frame
      this.beginFrame();

      // Render frame
      this.renderTick(deltaTime, context);

      // End frame
      this.endFrame();
    } catch (error) {
      console.error('Render loop error:', error);
    }
  }

  private renderTick(deltaTime: number, context: RenderContext): void {
    // Note: Time is already updated in beginFrame()

    // create TimeBindGroup
    const timeBindGroup = this.resourceManager.getBindGroupResource('TimeBindGroup');

    // Update projection and view matrices (same for all cubes)
    const now = performance.now() / 1000;

    const projectionMatrix = mat4.create();
    mat4.perspective(
      projectionMatrix,
      (2 * Math.PI) / 5, // fovy
      this.aspectRatio,
      0.1,
      100.0,
    );
    const viewMatrix = mat4.create();
    mat4.lookAt(
      viewMatrix,
      [0, 0, -5], // eye - moved back to see all cubes
      [0, 0, 0], // center
      [0, 1, 0], // up
    );

    // create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // begin render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getContext().getCurrentTexture().createView(),
          clearValue: chroma('#f8f8f8').gl(),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    // Debug: List all available resources
    if (this.frameCount % 60 === 0) {
      const resourceStats = this.resourceManager.getResourceStats();
      // Only log every 60 frames to reduce spam
      // console.log('[WebGPURenderer] Available resources:', resourceStats);
    }

    // set render pipeline
    const renderPipeline = this.resourceManager.getRenderPipelineResource('example');
    if (renderPipeline) {
      renderPass.setPipeline(renderPipeline.pipeline);

      // set vertex buffer
      const vertexBuffer = this.resourceManager.getBufferResource('Cube Vertices');
      if (vertexBuffer) {
        renderPass.setVertexBuffer(0, vertexBuffer.buffer); // binding actual vertex buffer
      }
      const indexBuffer = this.resourceManager.getBufferResource('Cube Indices');
      if (indexBuffer) {
        renderPass.setIndexBuffer(indexBuffer.buffer, 'uint16'); // binding actual index buffer
      }

      renderPass.setBindGroup(0, timeBindGroup.bindGroup); // binding actual bind group

      // Render each geometry instance
      for (const instance of this.geometryInstances) {
        // Update model matrix for this instance
        const modelMatrix = mat4.create();

        // Apply scale
        mat4.scale(modelMatrix, modelMatrix, instance.scale);

        // Apply rotation
        mat4.rotateY(modelMatrix, modelMatrix, now * 0.5 + instance.rotation[1]);
        mat4.rotateX(modelMatrix, modelMatrix, now * 0.3 + instance.rotation[0]);
        mat4.rotateZ(modelMatrix, modelMatrix, instance.rotation[2]);

        // Apply position
        mat4.translate(modelMatrix, modelMatrix, instance.position);

        // Calculate MVP matrix for this instance
        const mvpMatrix = mat4.create();
        mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
        mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

        // Update this instance's MVP uniform buffer
        this.device.queue.writeBuffer(instance.mvpBuffer, 0, new Float32Array(mvpMatrix));

        // Use this instance's MVPBindGroup
        renderPass.setBindGroup(1, instance.mvpBindGroup);

        // Draw this instance
        renderPass.drawIndexed(36);
      }
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

    // Note: Frame counter is incremented in endFrame()
    // Render loop continuation is handled by external system
  }

  getDevice(): GPUDevice {
    return this.device;
  }

  createBuffer(descriptor: BufferDescriptor): GPUBuffer {
    return this.bufferManager.createBuffer(descriptor);
  }

  createShader(descriptor: ShaderDescriptor): GPUShaderModule {
    return this.shaderManager.createShaderModule(descriptor.id, descriptor);
  }

  /**
   * Create geometry using geometry manager
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Geometry cache item
   */
  createGeometry(type: GeometryType, params: GeometryParams = {}) {
    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }
    return this.geometryManager.getGeometry(type, params);
  }

  /**
   * Create unit cube geometry (1x1x1)
   * @param segments Cube segments (not used for cube, kept for consistency)
   * @returns Geometry cache item
   */
  createCube(segments?: number) {
    return this.createGeometry('cube', { cube: { segments } });
  }

  /**
   * Create unit sphere geometry (radius = 0.5)
   * @param segments Sphere segments
   * @returns Geometry cache item
   */
  createSphere(segments: number = 32) {
    return this.createGeometry('sphere', { sphere: { segments } });
  }

  /**
   * Create unit plane geometry (1x1)
   * @param segments Plane segments
   * @returns Geometry cache item
   */
  createPlane(segments: number = 1) {
    return this.createGeometry('plane', { plane: { segments } });
  }

  updateBuffer(id: string, data: ArrayBuffer, offset?: number): void {
    if (!this.bufferManager) {
      throw new Error('Buffer manager not initialized');
    }
  }
  updateTexture(id: string, data: ImageData | HTMLImageElement): void {
    return;
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    return;
  }

  updateContextConfig(config: ContextConfig): void {
    this.context.getContext().configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'opaque',
    });
  }
  setBackgroundImage(image: HTMLImageElement): void {
    return;
  }
  clear(): void {
    // do nothing
  }

  onResize(): void {
    throw new Error('Method not implemented.');
  }
  onDestroy(): void {
    this.context.destroy();
  }
}
