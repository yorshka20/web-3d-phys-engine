import { ActiveCameraTag, Camera3DComponent, Transform3DComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/types/types';
import { createWebGPURenderer } from '@renderer/webGPU';
import { IWebGPURenderer } from '@renderer/webGPU/renderer/types/IWebGPURenderer';
import { GlobalUniforms, RenderContext, RenderStats, ViewportData } from '@renderer/webGPU/types';
import { mat4 } from 'gl-matrix';

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

    // Initialize global uniforms and render stats
    this.globalUniforms = {
      viewMatrix: new Float32Array(16),
      projectionMatrix: new Float32Array(16),
      viewProjectionMatrix: new Float32Array(16),
      cameraPosition: [0, 0, 0],
      cameraDirection: [0, 0, 0],
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

  updateGlobalUniforms(): void {
    if (!this.activeCameraEntity) return;

    const cameraData = this.prepareCameraData(this.activeCameraEntity);
    if (!cameraData) return;

    this.globalUniforms.viewMatrix = cameraData.viewMatrix;
    this.globalUniforms.projectionMatrix = cameraData.projectionMatrix;
    this.globalUniforms.viewProjectionMatrix = cameraData.viewProjectionMatrix;
    this.globalUniforms.cameraPosition = cameraData.position;
    this.globalUniforms.cameraDirection = cameraData.direction;
    this.globalUniforms.time = performance.now() / 1000;
    this.globalUniforms.frameCount++;
    this.globalUniforms.screenSize = [this.rootElement.clientWidth, this.rootElement.clientHeight];
    this.globalUniforms.pixelRatio = this.dpr;
  }

  getRenderStats(): RenderStats {
    return this.renderStats;
  }

  async setRenderer(renderer: IWebGPURenderer): Promise<void> {
    this.renderer = renderer;
    await this.renderer.init(this.canvas);
  }

  getRenderer(): IWebGPURenderer {
    return this.renderer;
  }

  onResize(): void {
    this.renderer.onResize();
    this.setViewport([0, 0, window.innerWidth, window.innerHeight]);
    this.updateGlobalUniforms(); // Update uniforms on resize
  }

  setCoarseMode(coarse: boolean): void {
    this.coarseMode = coarse;
    this.dpr = this.getDPR();
    this.renderer.updateContextConfig({
      dpr: this.dpr,
      width: this.rootElement.clientWidth,
      height: this.rootElement.clientHeight,
    });
    this.updateGlobalUniforms(); // Update uniforms on DPR change
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
    this.updateGlobalUniforms(); // Update uniforms on viewport change
  }

  setCameraTarget(entityId: string): void {
    this.cameraTargetId = entityId;
  }

  setCameraFollow(entityId: string): void {
    this.cameraTargetId = entityId;
    this.cameraFollow = true;
  }

  update(deltaTime: number): void {
    this.globalUniforms.deltaTime = deltaTime;
    this.updateCamera(); // Unified camera update logic
    this.updateGlobalUniforms();

    const viewportData: ViewportData = {
      x: this.viewport[0],
      y: this.viewport[1],
      width: this.viewport[2],
      height: this.viewport[3],
    };

    const renderContext: RenderContext = {
      camera: this.activeCameraEntity, // Pass the camera entity
      viewport: viewportData,
      globalUniforms: this.globalUniforms,
      renderMode: this.renderMode,
      enableFrustumCulling: true, // Placeholder
      enableOcclusion: false, // Placeholder
      maxDrawCalls: 1000, // Placeholder
    };

    // call renderer update, passing the new RenderContext
    this.renderer.render(deltaTime, renderContext);
  }

  getPlayerPosition(): [number, number] | undefined {
    // This method is likely 2D specific, might need to be removed or adapted for 3D
    return undefined; // Or throw an error if not applicable
  }

  private updateCamera(): void {
    // Find active camera if not set
    if (!this.activeCameraEntity) {
      this.activeCameraEntity = this.findActiveCamera();
    }

    // Update camera following logic if needed
    if (this.cameraTargetId && this.activeCameraEntity) {
      const targetEntity = this.world.getEntityById(this.cameraTargetId);
      if (targetEntity) {
        const targetTransform = targetEntity.getComponent<Transform3DComponent>(
          Transform3DComponent.componentName,
        );
        const cameraTransform = this.activeCameraEntity.getComponent<Transform3DComponent>(
          Transform3DComponent.componentName,
        );
        const cameraComponent = this.activeCameraEntity.getComponent<Camera3DComponent>(
          Camera3DComponent.componentName,
        );

        if (targetTransform && cameraTransform && cameraComponent) {
          // Update camera to look at target
          cameraComponent.lookAt(targetTransform.position);

          // Update camera position based on offset
          const offset: [number, number, number] = [0, 5, 10]; // Example offset
          cameraTransform.setPosition([
            targetTransform.position[0] + offset[0],
            targetTransform.position[1] + offset[1],
            targetTransform.position[2] + offset[2],
          ]);
        }
      }
    }
  }

  private updateCameraOffset(): void {
    // This method is 2D specific and will not be used in WebGPURenderSystem
    // Leaving it as a no-op for now to avoid compilation errors if called.
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
  private prepareCameraData(entity: Entity): {
    viewMatrix: Float32Array;
    projectionMatrix: Float32Array;
    viewProjectionMatrix: Float32Array;
    position: [number, number, number];
    direction: [number, number, number];
  } | null {
    const cameraComponent = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const transformComponent = entity.getComponent<Transform3DComponent>(
      Transform3DComponent.componentName,
    );

    if (!cameraComponent || !transformComponent) {
      return null;
    }

    const position = transformComponent.getPosition();
    const aspectRatio = this.rootElement.clientWidth / this.rootElement.clientHeight;

    // Calculate projection matrix
    const projectionMatrix = mat4.create();
    if (cameraComponent.projectionMode === 'perspective') {
      mat4.perspective(
        projectionMatrix,
        (cameraComponent.fov * Math.PI) / 180, // Convert to radians
        aspectRatio,
        cameraComponent.near,
        cameraComponent.far,
      );
    } else {
      // Orthographic projection
      const halfWidth = (cameraComponent.viewBounds.right - cameraComponent.viewBounds.left) / 2;
      const halfHeight = (cameraComponent.viewBounds.top - cameraComponent.viewBounds.bottom) / 2;
      mat4.ortho(
        projectionMatrix,
        -halfWidth,
        halfWidth,
        -halfHeight,
        halfHeight,
        cameraComponent.near,
        cameraComponent.far,
      );
    }

    // Calculate view matrix
    const viewMatrix = mat4.create();
    const target = cameraComponent.getTarget();
    const up = cameraComponent.getUp();

    mat4.lookAt(viewMatrix, position, target, up);

    // Calculate view-projection matrix
    const viewProjectionMatrix = mat4.create();
    mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix);

    // Calculate camera direction
    const direction: [number, number, number] = [
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ];
    const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (length > 0) {
      direction[0] /= length;
      direction[1] /= length;
      direction[2] /= length;
    }

    return {
      viewMatrix: new Float32Array(viewMatrix),
      projectionMatrix: new Float32Array(projectionMatrix),
      viewProjectionMatrix: new Float32Array(viewProjectionMatrix),
      position: [position[0], position[1], position[2]],
      direction,
    };
  }
}
