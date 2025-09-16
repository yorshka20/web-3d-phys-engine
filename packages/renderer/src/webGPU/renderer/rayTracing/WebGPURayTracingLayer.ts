import {
  Camera3DComponent,
  LightSource3DComponent,
  RectArea,
  RenderComponent,
  ShapeComponent,
  SpatialGridComponent,
  SpatialGridSystem,
  Transform3DComponent,
  TransformComponent,
} from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { IEntity } from '@ecs/core/ecs/types';
import { CanvasRenderLayer } from '../../../canvas2d/base/CanvasRenderLayer';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../../constant';
import {
  SamplingPattern,
  SerializedCamera,
  SerializedEntity,
  SerializedLight,
} from '../../../rayTracing/base/types';
import { BufferManager } from '../../core/BufferManager';
import { ShaderManager } from '../../core/shaders/ShaderManager';
import { ShaderType } from '../../core/types';
import { WebGPUContext } from '../../core/WebGPUContext';
import { WebGPUProgressiveRenderer } from './WebGPUProgressiveRenderer';

/**
 * WebGPU光线追踪渲染层
 * 继承自CanvasRenderLayer，实现基于GPU的光线追踪渲染
 * 相比Worker方案，提供更高的并行性能和更低的延迟
 */
export class WebGPURayTracingLayer extends CanvasRenderLayer {
  // 默认不可见
  visible = false;

  // WebGPU核心组件
  private webGPUContext: WebGPUContext;
  private bufferManager: BufferManager;
  private shaderManager: ShaderManager;
  private progressiveRenderer: WebGPUProgressiveRenderer;

  // ECS组件引用
  private cameraEntities: IEntity[] = [];
  private serializedCamera: SerializedCamera | null = null;
  private lightEntities: IEntity[] = [];
  private serializedLights: SerializedLight[] = [];
  private spatialGridComponent: SpatialGridComponent | null = null;

  // 渲染状态
  private frameCount: number = 0;
  private lastViewport: RectArea = [0, 0, 0, 0];
  private isInitialized: boolean = false;

  // 渐进式渲染配置
  private progressiveConfig = {
    currentPass: 0,
    totalPasses: 20,
    samplingPattern: 'checkerboard' as SamplingPattern,
    isComplete: false,
  };

  constructor(
    protected mainCanvas: HTMLCanvasElement,
    protected mainCtx: CanvasRenderingContext2D,
  ) {
    super(RenderLayerIdentifier.RAY_TRACING, RenderLayerPriority.RAY_TRACING, mainCanvas, mainCtx);

    // 初始化WebGPU组件
    this.webGPUContext = new WebGPUContext();
    this.bufferManager = new BufferManager();
    this.shaderManager = new ShaderManager();
    this.progressiveRenderer = new WebGPUProgressiveRenderer(
      this.webGPUContext.getDevice(),
      this.mainCanvas.width,
      this.mainCanvas.height,
    );
  }

  /**
   * 初始化WebGPU光线追踪层
   */
  async initialize(): Promise<void> {
    try {
      // 初始化WebGPU上下文
      await this.webGPUContext.initialize(this.mainCanvas, {
        powerPreference: 'high-performance',
        requiredFeatures: ['timestamp-query'],
        requiredLimits: {
          maxStorageBufferBindingSize: 1024 * 1024 * 256, // 256MB
          maxComputeWorkgroupStorageSize: 32768,
          maxComputeInvocationsPerWorkgroup: 1024,
        },
      });

      // 初始化渐进式渲染器
      await this.progressiveRenderer.initialize();

      // 编译着色器
      await this.compileShaders();

      this.isInitialized = true;
      console.log('WebGPU RayTracingLayer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebGPU RayTracingLayer:', error);
      throw error;
    }
  }

  /**
   * 编译光线追踪着色器
   */
  private async compileShaders(): Promise<void> {
    // 编译光线追踪计算着色器
    this.shaderManager.createShaderModule('rayTracing', {
      id: 'rayTracing',
      code: this.getRayTracingComputeShader(),
      type: ShaderType.COMPUTE,
      entryPoint: 'main',
      label: 'Ray Tracing Compute Shader',
    });

    // 编译显示渲染着色器
    this.shaderManager.createShaderModule('display', {
      id: 'display',
      code: this.getDisplayRenderShader(),
      type: ShaderType.VERTEX,
      entryPoint: 'vertex_main',
      label: 'Display Vertex Shader',
    });

    this.shaderManager.createShaderModule('displayFragment', {
      id: 'displayFragment',
      code: this.getDisplayFragmentShader(),
      type: ShaderType.FRAGMENT,
      entryPoint: 'fragment_main',
      label: 'Display Fragment Shader',
    });

    // 创建渲染管线
    this.shaderManager.createRenderPipeline('display', {
      vertex: {
        module: this.shaderManager.getShaderModule('display')!,
        entryPoint: 'vertex_main',
      },
      fragment: {
        module: this.shaderManager.getShaderModule('displayFragment')!,
        entryPoint: 'fragment_main',
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    // 创建计算管线
    this.shaderManager.createComputePipeline('rayTracing', {
      compute: {
        module: this.shaderManager.getShaderModule('rayTracing')!,
        entryPoint: 'main',
      },
    });
  }

  /**
   * 主更新循环
   */
  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    if (!this.isInitialized || !this.getSpatialGridComponent()) {
      return;
    }

    // 保持数组引用
    this.lastViewport[0] = viewport[0];
    this.lastViewport[1] = viewport[1];
    this.lastViewport[2] = viewport[2];
    this.lastViewport[3] = viewport[3];

    // 执行光线追踪
    this.executeRayTracing();

    // 渲染结果到屏幕
    this.renderResults();

    this.frameCount++;
  }

  /**
   * 执行光线追踪
   */
  private executeRayTracing(): void {
    // 更新场景数据
    this.updateSceneBuffers();

    // 执行渐进式光线追踪
    this.progressiveRenderer.executeProgressivePass();

    // 更新渐进式配置
    this.progressiveConfig.currentPass++;
    if (this.progressiveConfig.currentPass >= this.progressiveConfig.totalPasses) {
      this.progressiveConfig.isComplete = true;
      this.progressiveConfig.currentPass = 0;
    }
  }

  /**
   * 更新场景缓冲区
   */
  private updateSceneBuffers(): void {
    // 序列化场景数据
    const sceneData = this.serializeScene();

    // 更新GPU缓冲区
    // 这里需要根据具体的缓冲区布局来更新
    // 暂时使用占位符
  }

  /**
   * 渲染结果到屏幕
   */
  private renderResults(): void {
    const commandEncoder = this.webGPUContext.getDevice().createCommandEncoder();
    const context = this.webGPUContext.getContext();

    // 渲染通道
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    // 设置渲染管线
    const pipeline = this.shaderManager.getRenderPipeline('display');
    if (pipeline) {
      renderPass.setPipeline(pipeline);

      // 设置绑定组
      const bindGroup = this.createDisplayBindGroup();
      if (bindGroup) {
        renderPass.setBindGroup(0, bindGroup);
      }

      // 绘制全屏四边形
      renderPass.draw(6, 1, 0, 0);
    }

    renderPass.end();

    // 提交命令
    this.webGPUContext.getDevice().queue.submit([commandEncoder.finish()]);
  }

  /**
   * 创建显示绑定组
   */
  private createDisplayBindGroup(): Any {
    // 这里需要创建绑定组来绑定累积纹理
    // 暂时返回null
    return null;
  }

  /**
   * 序列化场景数据
   */
  private serializeScene(): Any {
    const entities = this.getLayerEntities(this.lastViewport);
    const lights = this.getSerializedLights();
    const camera = this.getSerializedCamera();

    return {
      entities: this.serializeEntities(entities),
      lights,
      camera,
      viewport: this.lastViewport,
    };
  }

  // 继承的方法实现
  private getCameras(): IEntity[] {
    if (this.cameraEntities.length === 0) {
      this.cameraEntities = this.getWorld().getEntitiesByCondition((entity) =>
        entity.hasComponent(Camera3DComponent.componentName),
      );
    }
    return this.cameraEntities;
  }

  private getLights(): IEntity[] {
    if (this.lightEntities.length === 0) {
      this.lightEntities = this.getWorld().getEntitiesByCondition((entity) =>
        entity.hasComponent(LightSource3DComponent.componentName),
      );
    }
    return this.lightEntities;
  }

  private getSpatialGridComponent(): SpatialGridComponent {
    if (this.spatialGridComponent) {
      return this.spatialGridComponent;
    }
    const spatialGridSystem = this.getWorld().getSystem<SpatialGridSystem>(
      'SpatialGridSystem',
      SystemPriorities.SPATIAL_GRID,
    );
    if (!spatialGridSystem) {
      throw new Error('SpatialGridSystem not found');
    }
    this.spatialGridComponent = spatialGridSystem.getSpatialGridComponent();
    return this.spatialGridComponent;
  }

  private getSerializedLights(): SerializedLight[] {
    if (this.serializedLights.length > 0) {
      return this.serializedLights;
    }
    const lights = this.getLights();
    if (lights.length === 0) {
      throw new Error('No active lights found');
    }
    this.serializedLights = this.serializeLights(lights);
    return this.serializedLights;
  }

  private getSerializedCamera(): SerializedCamera {
    if (this.serializedCamera) {
      return this.serializedCamera;
    }
    const cameras = this.getCameras();
    if (cameras.length === 0) {
      throw new Error('No active camera found');
    }
    this.serializedCamera = this.serializeCamera(cameras);
    return this.serializedCamera;
  }

  private serializeEntities(entities: IEntity[]): Record<string, SerializedEntity> {
    const serialized: Record<string, SerializedEntity> = {};
    for (const entity of entities) {
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const render = entity.getComponent<RenderComponent>(RenderComponent.componentName);

      if (shape && transform && render) {
        serialized[entity.id] = {
          id: entity.id,
          shape: shape.descriptor,
          position: transform.getPosition(),
          rotation: transform.rotation,
          material: {
            color: render.getColor(),
            reflectivity: 0.1,
            roughness: 0.8,
          },
        };
      }
    }
    return serialized;
  }

  private serializeLights(entities: IEntity[]): SerializedLight[] {
    const lights: SerializedLight[] = [];
    for (const entity of entities) {
      const light = entity.getComponent<LightSource3DComponent>(
        LightSource3DComponent.componentName,
      );
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (!light?.enabled || !transform) continue;

      lights.push({
        position: transform.getPosition(),
        height: light.height,
        color: light.color,
        intensity: light.intensity,
        radius: light.radius,
        type: light.type,
        castShadows: light.castShadows,
        attenuation: light.attenuation,
        direction: light.direction,
        spotAngle: light.spotAngle,
        spotPenumbra: light.spotPenumbra,
        enabled: light.enabled,
        layer: light.layer,
      });
    }
    return lights;
  }

  private serializeCamera(cameras: IEntity[]): SerializedCamera {
    const entity = cameras[0]!;
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const transform = entity.getComponent<Transform3DComponent>(Transform3DComponent.componentName);
    if (!camera || !transform || !camera.isActive) {
      throw new Error('No active camera found');
    }
    return {
      position: transform.getPosition(),
      fov: camera.fov,
      facing: camera.facing,
      pitch: camera.pitch,
      roll: camera.roll,
      projectionMode: camera.projectionMode,
      cameraMode: camera.cameraMode,
      aspectRatio: camera.aspectRatio,
      near: camera.near,
      far: camera.far,
      viewBounds: camera.viewBounds,
      resolution: camera.resolution,
      zoom: camera.zoom,
    };
  }

  /**
   * 实体过滤器
   */
  filterEntity(entity: IEntity): boolean {
    return (
      entity.isType('object') &&
      entity.hasComponent(ShapeComponent.componentName) &&
      entity.hasComponent(TransformComponent.componentName) &&
      entity.hasComponent(RenderComponent.componentName)
    );
  }

  /**
   * 获取光线追踪计算着色器代码
   */
  private getRayTracingComputeShader(): string {
    return `
      struct Camera {
        position: vec3<f32>,
        fov: f32,
        facing: f32,
        height: f32,
        pitch: f32,
        roll: f32,
        aspect: f32,
        near: f32,
        far: f32,
        zoom: f32
      }

      struct Light {
        position: vec3<f32>,
        color: vec3<f32>,
        intensity: f32,
        radius: f32,
        height: f32,
        type: u32,
        castShadows: u32,
        enabled: u32
      }

      struct Entity {
        position: vec3<f32>,
        rotation: f32,
        shapeType: u32,
        materialColor: vec3<f32>,
        materialReflectivity: f32,
        materialRoughness: f32
      }

      struct Ray {
        origin: vec3<f32>,
        direction: vec3<f32>
      }

      struct RayResult {
        color: vec3<f32>,
        distance: f32,
        hit: u32
      }

      @group(0) @binding(0) var<uniform> camera: Camera;
      @group(0) @binding(1) var<storage, read> lights: array<Light>;
      @group(0) @binding(2) var<storage, read> entities: array<Entity>;
      @group(0) @binding(3) var<storage, read_write> rays: array<Ray>;
      @group(0) @binding(4) var<storage, read_write> results: array<RayResult>;
      @group(0) @binding(5) var accumulationTexture: texture_storage_2d<rgba32float, read_write>;

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let pixelCoord = vec2<u32>(id.xy);
        let rayIndex = pixelCoord.y * 1920u + pixelCoord.x; // Assuming 1920 width
        
        // Generate ray for this pixel
        let ray = generateCameraRay(pixelCoord);
        rays[rayIndex] = ray;
        
        // Trace ray
        let result = traceRay(ray);
        results[rayIndex] = result;
        
        // Accumulate result
        let currentColor = textureLoad(accumulationTexture, pixelCoord);
        let newColor = currentColor.rgb + result.color;
        textureStore(accumulationTexture, pixelCoord, vec4<f32>(newColor, 1.0));
      }
      
      fn generateCameraRay(pixelCoord: vec2<u32>) -> Ray {
        // Camera ray generation logic
        let aspectRatio = camera.aspect;
        let fovRadians = radians(camera.fov);
        let halfFov = tan(fovRadians * 0.5);
        
        let x = (f32(pixelCoord.x) / 1920.0 - 0.5) * 2.0 * halfFov * aspectRatio;
        let y = (f32(pixelCoord.y) / 1080.0 - 0.5) * 2.0 * halfFov;
        
        let direction = normalize(vec3<f32>(x, y, 1.0));
        
        return Ray(
          camera.position,
          direction
        );
      }
      
      fn traceRay(ray: Ray) -> RayResult {
        // Simple ray tracing logic
        var closestHit = RayResult(vec3<f32>(0.0), 1000.0, 0u);
        
        // Test against entities
        for (var i = 0u; i < arrayLength(&entities); i++) {
          let entity = entities[i];
          let hit = testSphereIntersection(ray, entity.position, 1.0);
          
          if (hit > 0.0 && hit < closestHit.distance) {
            closestHit.distance = hit;
            closestHit.hit = 1u;
            closestHit.color = entity.materialColor;
          }
        }
        
        // Apply lighting
        if (closestHit.hit == 1u) {
          let hitPoint = ray.origin + ray.direction * closestHit.distance;
          closestHit.color = calculateLighting(hitPoint, closestHit.color);
        }
        
        return closestHit;
      }
      
      fn testSphereIntersection(ray: Ray, center: vec3<f32>, radius: f32) -> f32 {
        let oc = ray.origin - center;
        let a = dot(ray.direction, ray.direction);
        let b = 2.0 * dot(oc, ray.direction);
        let c = dot(oc, oc) - radius * radius;
        let discriminant = b * b - 4.0 * a * c;
        
        if (discriminant < 0.0) {
          return -1.0;
        }
        
        let t1 = (-b - sqrt(discriminant)) / (2.0 * a);
        let t2 = (-b + sqrt(discriminant)) / (2.0 * a);
        
        if (t1 > 0.0) return t1;
        if (t2 > 0.0) return t2;
        return -1.0;
      }
      
      fn calculateLighting(point: vec3<f32>, materialColor: vec3<f32>) -> vec3<f32> {
        var finalColor = vec3<f32>(0.0);
        
        for (var i = 0u; i < arrayLength(&lights); i++) {
          let light = lights[i];
          if (light.enabled == 0u) continue;
          
          let lightDir = normalize(light.position - point);
          let distance = length(light.position - point);
          let attenuation = 1.0 / (1.0 + distance * distance);
          
          let diffuse = max(dot(lightDir, vec3<f32>(0.0, 1.0, 0.0)), 0.0);
          finalColor += light.color * light.intensity * diffuse * attenuation;
        }
        
        return finalColor * materialColor;
      }
    `;
  }

  /**
   * 获取显示顶点着色器代码
   */
  private getDisplayRenderShader(): string {
    return `
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) texCoord: vec2<f32>
      }
      
      @vertex
      fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        let positions = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>( 1.0, -1.0),
          vec2<f32>(-1.0,  1.0),
          vec2<f32>(-1.0,  1.0),
          vec2<f32>( 1.0, -1.0),
          vec2<f32>( 1.0,  1.0)
        );
        
        let texCoords = array<vec2<f32>, 6>(
          vec2<f32>(0.0, 1.0),
          vec2<f32>(1.0, 1.0),
          vec2<f32>(0.0, 0.0),
          vec2<f32>(0.0, 0.0),
          vec2<f32>(1.0, 1.0),
          vec2<f32>(1.0, 0.0)
        );
        
        return VertexOutput(
          vec4<f32>(positions[vertexIndex], 0.0, 1.0),
          texCoords[vertexIndex]
        );
      }
    `;
  }

  /**
   * 获取显示片段着色器代码
   */
  private getDisplayFragmentShader(): string {
    return `
      @group(0) @binding(0) var accumulationTexture: texture_2d<f32>;
      @group(0) @binding(1) var textureSampler: sampler;
      
      @fragment
      fn fragment_main(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
        let color = textureSample(accumulationTexture, textureSampler, texCoord);
        return vec4<f32>(color.rgb, 1.0);
      }
    `;
  }

  /**
   * 设置渲染质量
   */
  setRenderingQuality(totalPasses: number): void {
    if (totalPasses !== this.progressiveConfig.totalPasses) {
      this.progressiveConfig.totalPasses = Math.max(1, totalPasses);
      this.progressiveConfig.currentPass = 0;
      this.progressiveConfig.isComplete = false;
      console.log(`Updated rendering quality: ${totalPasses} passes`);
    }
  }

  /**
   * 设置采样模式
   */
  setSamplingPattern(pattern: SamplingPattern): void {
    if (pattern !== this.progressiveConfig.samplingPattern) {
      this.progressiveConfig.samplingPattern = pattern;
      this.progressiveConfig.currentPass = 0;
      this.progressiveConfig.isComplete = false;
      console.log(`Updated sampling pattern: ${pattern}`);
    }
  }

  /**
   * 获取渲染统计信息
   */
  getRenderingStats(): {
    currentPass: number;
    totalPasses: number;
    isComplete: boolean;
    frameCount: number;
  } {
    return {
      currentPass: this.progressiveConfig.currentPass,
      totalPasses: this.progressiveConfig.totalPasses,
      isComplete: this.progressiveConfig.isComplete,
      frameCount: this.frameCount,
    };
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    this.bufferManager.onDestroy();
    this.shaderManager.onDestroy();
    this.progressiveRenderer.destroy();
    this.webGPUContext.destroy();
  }
}
