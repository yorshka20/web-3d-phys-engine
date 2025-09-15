import {
  ActiveCameraTag,
  Camera3DComponent,
  CameraData,
  GeometryData,
  GeometryFactory,
  Mesh3DComponent,
  PMXBoneComponent,
  PMXMeshComponent,
  PMXMorphComponent,
  Transform3DComponent,
  WebGPU3DRenderComponent,
} from '@ecs/components';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RectArea, Vec3 } from '@ecs/types/types';
import { createWebGPURenderer } from '@renderer/webGPU';
import { IWebGPURenderer } from '@renderer/webGPU/renderer/types/IWebGPURenderer';
import { GlobalUniforms, RenderStats, ViewportData } from '@renderer/webGPU/types';
import { mat3, mat4 } from 'gl-matrix';
import { FrameData, RenderData } from './types';

/**
 * Responsibilities:
 * - Canvas DOM management and lifecycle
 * - High-level rendering flow control
 * - Camera and viewport management
 * - Integration with ECS system
 * - Renderer instance management
 */
export class WebGPURenderSystem extends System {
  static getInstance(): WebGPURenderSystem {
    if (!WebGPURenderSystem.instance) {
      throw new Error('WebGPURenderSystem instance not initialized');
    }
    return WebGPURenderSystem.instance as WebGPURenderSystem;
  }

  private static instance: WebGPURenderSystem;

  private canvas: HTMLCanvasElement;

  private renderer!: IWebGPURenderer; // This will actually be an IWebGPURenderer

  private rootElement: HTMLElement;
  private viewport: RectArea;
  private cameraTargetId?: string;
  private cameraFollow: boolean = false;

  private dpr: number = 1;
  private coarseMode: boolean = false;

  // New 3D camera system
  private activeCameraEntity?: Entity;
  private renderMode: 'AUTO' | '2D' | '3D' | 'MIXED' = '3D';

  // WebGPU specific
  private globalUniforms!: GlobalUniforms;
  private renderStats!: RenderStats;

  constructor(rootElement: HTMLElement, bgImage?: HTMLImageElement) {
    super('WebGPURenderSystem', SystemPriorities.RENDER, 'render');

    this.rootElement = rootElement;
    const dpr = this.getDPR();
    this.viewport = [0, 0, rootElement.clientWidth * dpr, rootElement.clientHeight * dpr];

    this.canvas = this.createCanvas();
    this.rootElement.appendChild(this.canvas);

    // Create webgpu renderer
    const renderer = createWebGPURenderer(this.rootElement, 'webgpu-renderer');
    this.setRenderer(renderer);

    // @ts-expect-error - Adding renderer to window for debugging
    window.renderer = renderer;

    // Initialize global uniforms and render stats
    this.globalUniforms = {
      time: 0,
      deltaTime: 0,
      frameCount: 0,
      screenSize: [0, 0],
      pixelRatio: dpr,
    };
    this.renderStats = {
      frameTime: 0,
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
      bufferMemory: 0,
      textureMemory: 0,
    };

    WebGPURenderSystem.instance = this;

    if (bgImage) {
      // this.setBackgroundImage(bgImage);
      // WebGPU renderer will handle background differently
    }
  }

  init(): void {
    super.init();
    this.renderer.init(this.canvas);
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const dpr = this.getDPR();

    //
    canvas.width = this.rootElement.clientWidth * dpr;
    canvas.height = this.rootElement.clientHeight * dpr;
    canvas.style.width = `${this.rootElement.clientWidth}px`;
    canvas.style.height = `${this.rootElement.clientHeight}px`;

    return canvas;
  }

  private getDPR(): number {
    return this.coarseMode ? 1 : window.devicePixelRatio || 1;
  }

  setActiveCamera(entity: Entity): void {
    this.activeCameraEntity = entity;
  }

  getActiveCamera(): Entity | undefined {
    return this.activeCameraEntity;
  }

  getGlobalUniforms(): GlobalUniforms {
    return this.globalUniforms;
  }

  private updateGlobalUniforms(deltaTime?: number): void {
    this.globalUniforms.deltaTime = deltaTime ?? this.globalUniforms.deltaTime;
    this.globalUniforms.time = performance.now() / 1000;
    this.globalUniforms.frameCount++;
    this.globalUniforms.pixelRatio = this.dpr;
  }

  getRenderStats(): RenderStats {
    return this.renderStats;
  }

  setRenderer(renderer: IWebGPURenderer): void {
    this.renderer = renderer;
  }

  getRenderer(): IWebGPURenderer {
    return this.renderer;
  }

  onResize(): void {
    this.renderer.onResize();
    this.setViewport([0, 0, window.innerWidth, window.innerHeight]);
    this.globalUniforms.screenSize = [this.rootElement.clientWidth, this.rootElement.clientHeight];
  }

  setCoarseMode(coarse: boolean): void {
    this.coarseMode = coarse;
    this.dpr = this.getDPR();
    this.renderer.updateContextConfig({
      dpr: this.dpr,
      width: this.rootElement.clientWidth,
      height: this.rootElement.clientHeight,
    });
  }

  getViewport(): RectArea {
    return this.viewport;
  }

  setBackgroundImage(image: HTMLImageElement): void {
    // WebGPU renderer will handle background differently
    // this.renderer.setBackgroundImage(image);
  }

  setViewport(viewport: RectArea): void {
    this.viewport[0] = viewport[0];
    this.viewport[1] = viewport[1];
    this.viewport[2] = viewport[2];
    this.viewport[3] = viewport[3];
  }

  setCameraTarget(entityId: string): void {
    this.cameraTargetId = entityId;
  }

  setCameraFollow(entityId: string): void {
    this.cameraTargetId = entityId;
    this.cameraFollow = true;
  }

  private filterEntities(): Entity[] {
    return this.world.getEntitiesByCondition(
      (entity) =>
        entity.hasComponent(WebGPU3DRenderComponent.componentName) &&
        entity.hasComponent(Transform3DComponent.componentName) &&
        (entity.hasComponent(Mesh3DComponent.componentName) ||
          entity.hasComponent(PMXMeshComponent.componentName)),
    );
  }

  update(deltaTime: number): void {
    this.updateGlobalUniforms(deltaTime);

    const viewportData: ViewportData = {
      x: this.viewport[0],
      y: this.viewport[1],
      width: this.viewport[2],
      height: this.viewport[3],
    };

    const frameData: FrameData = {
      scene: {
        camera: this.prepareCameraData(), // Pass the camera entity
        lights: [], // all renderable entities
        environment: {
          ambientColor: [0, 0, 0],
          ambientIntensity: 0,
        },
      },
      renderables: this.generateRenderData(), // all renderable entities
      config: {
        viewport: viewportData,
        renderMode: this.renderMode,
        enableFrustumCulling: true,
        enableOcclusion: false,
        maxDrawCalls: 1000,
      },
      globalUniforms: this.globalUniforms,
    };

    // call renderer update, passing the new RenderContext
    this.renderer.render(deltaTime, frameData);
  }

  /**
   * Generate render data from entities
   */
  private generateRenderData(): RenderData[] {
    const entities = this.filterEntities();
    const renderDataList: RenderData[] = [];

    for (const entity of entities) {
      const renderDataArray = this.extractEntityRenderData(entity);
      if (renderDataArray && renderDataArray.length > 0) {
        renderDataList.push(...renderDataArray);
      }
    }

    // Sort by render order for proper rendering sequence
    return renderDataList.sort((a, b) => a.renderOrder - b.renderOrder);
  }

  /**
   * Extract render data from a single entity
   */
  private extractEntityRenderData(entity: Entity): RenderData[] {
    const transformComponent = entity.getComponent<Transform3DComponent>(
      Transform3DComponent.componentName,
    );
    const renderComponent = entity.getComponent<WebGPU3DRenderComponent>(
      WebGPU3DRenderComponent.componentName,
    );

    if (!transformComponent || !renderComponent) {
      return [];
    }

    // Check for PMX mesh component first
    if (entity.hasComponent(PMXMeshComponent.componentName)) {
      const pmxMeshComponent = entity.getComponent<PMXMeshComponent>(
        PMXMeshComponent.componentName,
      );
      if (pmxMeshComponent) {
        return this.extractPMXMeshRenderData(
          entity,
          pmxMeshComponent,
          transformComponent,
          renderComponent,
        );
      }
    }

    // Fall back to regular mesh component
    const meshComponent = entity.getComponent<Mesh3DComponent>(Mesh3DComponent.componentName);
    if (!meshComponent) {
      return [];
    }

    // Ensure geometry data is generated
    if (!meshComponent.geometryData) {
      meshComponent.geometryData = this.generateGeometryData(meshComponent);
    }

    // Generate unique geometry ID for caching (include entity ID to avoid conflicts)
    const geometryId = this.generateGeometryId(meshComponent, entity);

    // Get world matrix from transform
    const worldMatrix = transformComponent.getWorldMatrix();

    // Calculate normal matrix (inverse transpose of upper 3x3 world matrix)
    const normalMatrix = this.calculateNormalMatrix(worldMatrix);

    return [
      {
        entityId: entity.numericId,
        geometryId,
        geometryData: meshComponent.geometryData,
        worldMatrix: new Float32Array(worldMatrix),
        normalMatrix,
        material: renderComponent.getMaterial(),
        materialUniforms: renderComponent.getUniforms() || {},
        renderOrder: renderComponent.getLayer() || 0,
        castShadow: renderComponent.getCastShadow() ?? true,
        receiveShadow: renderComponent.getReceiveShadow() ?? true,
      },
    ];
  }

  /**
   * Extract render data from PMX mesh component
   */
  private extractPMXMeshRenderData(
    entity: Entity,
    pmxMeshComponent: PMXMeshComponent,
    transformComponent: Transform3DComponent,
    renderComponent: WebGPU3DRenderComponent,
  ): RenderData[] {
    const assetDescriptor = pmxMeshComponent.resolveAsset();

    // Check if PMX model is loaded
    if (!pmxMeshComponent.isLoaded() || !assetDescriptor) {
      console.warn('[WebGPURenderSystem] PMX model not loaded:', pmxMeshComponent.assetId);
      return [];
    }

    // Get PMX model data from asset descriptor
    const pmxModel = assetDescriptor.rawData as PMXModel;
    if (!pmxModel || !pmxModel.materials) {
      console.warn('[WebGPURenderSystem] PMX model data not available:', pmxMeshComponent.assetId);
      return [];
    }

    // Get world matrix from transform
    const worldMatrix = transformComponent.getWorldMatrix();

    // Calculate normal matrix (inverse transpose of upper 3x3 world matrix)
    const normalMatrix = this.calculateNormalMatrix(worldMatrix);

    // Extract animation data from entity components
    let morphComponent: PMXMorphComponent | undefined;
    let boneComponent: PMXBoneComponent | undefined;
    if (entity.hasComponent(PMXMorphComponent.componentName)) {
      morphComponent = entity.getComponent<PMXMorphComponent>(PMXMorphComponent.componentName);
    }
    if (entity.hasComponent(PMXBoneComponent.componentName)) {
      boneComponent = entity.getComponent<PMXBoneComponent>(PMXBoneComponent.componentName);
    }

    // Get animation data
    const boneMatrices = boneComponent ? this.extractBoneMatrices(boneComponent) : undefined;
    const morphWeights = morphComponent ? this.extractMorphWeights(morphComponent) : undefined;
    const morphData = morphComponent ? this.extractMorphData(morphComponent) : undefined;

    // Create a renderable for each material
    const renderDataList: RenderData[] = [];

    for (let materialIndex = 0; materialIndex < pmxModel.materials.length; materialIndex++) {
      // Create a unique geometry ID for this material
      const geometryId = `pmx_${pmxMeshComponent.assetId}_${entity.id}_material_${materialIndex}`;

      // Create a placeholder geometry data for PMX models
      // The actual geometry will be created by the renderer when needed
      const geometryData: GeometryData = {
        vertices: new Float32Array(0), // Will be populated by renderer
        indices: new Uint16Array(0), // Will be populated by renderer
        vertexCount: 0,
        indexCount: 0,
        primitiveType: 'triangle-list',
        vertexFormat: 'pmx', // PMX format with skinning data
        bounds: {
          min: [0, 0, 0],
          max: [0, 0, 0],
        },
      };

      renderDataList.push({
        entityId: entity.numericId,
        geometryId,
        geometryData,
        worldMatrix: new Float32Array(worldMatrix),
        normalMatrix,
        material: renderComponent.getMaterial(),
        materialUniforms: renderComponent.getUniforms() || {},
        renderOrder: renderComponent.getLayer() || 0,
        castShadow: pmxMeshComponent.castShadow,
        receiveShadow: pmxMeshComponent.receiveShadow,
        // Add PMX-specific data
        pmxAssetId: pmxMeshComponent.assetId,
        pmxComponent: pmxMeshComponent,
        materialIndex, // Add material index
        // Add animation data
        boneMatrices,
        morphWeights,
        morphData,
      });
    }

    return renderDataList;
  }

  /**
   * Generate geometry data if not exists
   */
  private generateGeometryData(meshComponent: Mesh3DComponent): GeometryData {
    return GeometryFactory.createGeometryDataByDescriptor(
      meshComponent.descriptor,
      meshComponent.getPrimitiveType(),
    );
  }

  /**
   * Extract bone matrices from bone component
   */
  private extractBoneMatrices(boneComponent: PMXBoneComponent): Float32Array | undefined {
    if (!boneComponent.needsGPUUpdate()) {
      return undefined;
    }

    // Get bone matrices from component
    const boneMatrices = boneComponent.getBoneMatricesArray();
    return boneMatrices;
  }

  /**
   * Extract morph weights from morph component
   */
  private extractMorphWeights(morphComponent: PMXMorphComponent): Float32Array | undefined {
    if (!morphComponent.needsGPUUpdate()) {
      return undefined;
    }

    // Get morph weights from component
    const morphWeights = morphComponent.getMorphWeightsArray();
    return morphWeights;
  }

  /**
   * Extract morph data from morph component
   */
  private extractMorphData(morphComponent: PMXMorphComponent): Float32Array | undefined {
    if (!morphComponent.needsGPUUpdate()) {
      return undefined;
    }

    // Get morph data from component
    const morphData = morphComponent.getMorphDataArray();
    return morphData.length > 0 ? morphData : undefined;
  }

  /**
   * Generate unique geometry ID for resource caching
   */
  private generateGeometryId(meshComponent: Mesh3DComponent, entity: Entity): string {
    // Create hash based on geometry descriptor and entity ID to ensure uniqueness
    const descriptor = meshComponent.descriptor;
    return `${descriptor.type}_${entity.id}_${JSON.stringify(descriptor.params)}`;
  }

  /**
   * Calculate normal matrix from world matrix
   */
  private calculateNormalMatrix(worldMatrix: Float32Array): Float32Array {
    // Extract upper 3x3 matrix
    const matrix3x3 = mat3.create();
    mat3.fromMat4(matrix3x3, worldMatrix);

    // Calculate inverse transpose for normal transformation
    const normalMatrix = mat3.create();
    mat3.invert(normalMatrix, matrix3x3);
    mat3.transpose(normalMatrix, normalMatrix);

    return new Float32Array(normalMatrix);
  }

  onDestroy(): void {
    this.renderer.destroy();
  }

  /**
   * Find the active camera entity
   */
  private findActiveCamera(): Entity | undefined {
    // First try to find entity with ActiveCameraTag
    const camerasWithTag = this.world.getEntitiesByCondition(
      (entity) =>
        entity.hasComponent(Camera3DComponent.componentName) &&
        entity.hasComponent(ActiveCameraTag.componentName),
    );

    if (camerasWithTag.length > 0) {
      return camerasWithTag[0];
    }

    // Fallback to first camera entity
    const allCameras = this.world.getEntitiesByCondition((entity) =>
      entity.hasComponent(Camera3DComponent.componentName),
    );

    return allCameras.length > 0 ? allCameras[0] : undefined;
  }

  /**
   * Prepare camera data for rendering
   */
  private prepareCameraData(): CameraData {
    if (!this.activeCameraEntity) {
      this.activeCameraEntity = this.findActiveCamera();
    }

    if (!this.activeCameraEntity) {
      throw new Error('No active camera entity found');
    }

    const cameraComponent = this.activeCameraEntity.getComponent<Camera3DComponent>(
      Camera3DComponent.componentName,
    );
    const transformComponent = this.activeCameraEntity.getComponent<Transform3DComponent>(
      Transform3DComponent.componentName,
    );

    if (!cameraComponent || !transformComponent) {
      throw new Error('Camera or transform component not found');
    }

    const position = transformComponent.getPosition();
    const target = cameraComponent.getTarget();
    const up = cameraComponent.getUp();
    const aspectRatio = this.rootElement.clientWidth / this.rootElement.clientHeight;

    // Calculate view matrix
    const viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, position, target, up);

    // Calculate projection matrix
    const projectionMatrix = mat4.create();
    if (cameraComponent.projectionMode === 'perspective') {
      mat4.perspective(
        projectionMatrix,
        (cameraComponent.fov * Math.PI) / 180,
        aspectRatio,
        cameraComponent.near,
        cameraComponent.far,
      );
    } else {
      const bounds = cameraComponent.viewBounds;
      mat4.ortho(
        projectionMatrix,
        bounds.left,
        bounds.right,
        bounds.bottom,
        bounds.top,
        cameraComponent.near,
        cameraComponent.far,
      );
    }

    // Calculate combined matrices
    const viewProjectionMatrix = mat4.create();
    mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix);

    const inverseViewMatrix = mat4.create();
    mat4.invert(inverseViewMatrix, viewMatrix);

    const inverseProjectionMatrix = mat4.create();
    mat4.invert(inverseProjectionMatrix, projectionMatrix);

    // Calculate camera vectors
    const forward: Vec3 = [
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ];
    const forwardLength = Math.sqrt(forward[0] ** 2 + forward[1] ** 2 + forward[2] ** 2);
    if (forwardLength > 0) {
      forward[0] /= forwardLength;
      forward[1] /= forwardLength;
      forward[2] /= forwardLength;
    }

    // Calculate right vector: right = forward × up
    const right: Vec3 = [
      forward[1] * up[2] - forward[2] * up[1],
      forward[2] * up[0] - forward[0] * up[2],
      forward[0] * up[1] - forward[1] * up[0],
    ];
    const rightLength = Math.sqrt(right[0] ** 2 + right[1] ** 2 + right[2] ** 2);
    if (rightLength > 0) {
      right[0] /= rightLength;
      right[1] /= rightLength;
      right[2] /= rightLength;
    }

    // Update camera component matrices (cache for shader)
    cameraComponent.setViewMatrix(new Float32Array(viewMatrix));
    cameraComponent.setProjectionMatrix(new Float32Array(projectionMatrix));
    cameraComponent.setViewProjectionMatrix(new Float32Array(viewProjectionMatrix));

    return {
      viewMatrix: new Float32Array(viewMatrix),
      projectionMatrix: new Float32Array(projectionMatrix),
      viewProjectionMatrix: new Float32Array(viewProjectionMatrix),
      inverseViewMatrix: new Float32Array(inverseViewMatrix),
      inverseProjectionMatrix: new Float32Array(inverseProjectionMatrix),
      position: [position[0], position[1], position[2]],
      forward,
      up: [up[0], up[1], up[2]], // copy it
      right,
      fov: cameraComponent.projectionMode === 'perspective' ? cameraComponent.fov : undefined,
      aspect: aspectRatio,
      near: cameraComponent.near,
      far: cameraComponent.far,
    };
  }
}
