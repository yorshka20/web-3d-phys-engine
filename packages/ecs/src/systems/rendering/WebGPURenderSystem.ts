import { Transform3DComponent } from '@ecs/components/physics/Transform3DComponent';
import { Camera3DComponent } from '@ecs/components/rendering/Camera3DComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/types/types';
import { IRenderLayer, IWebGPURenderer } from '@renderer/types';
import { createWebGPURenderer } from '@renderer/webGPU';
import { GlobalUniforms, RenderContext, RenderStats, ViewportData } from '@renderer/webGPU/types';

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
  private camera3D!: Camera3DComponent;
  private renderMode: 'AUTO' | '2D' | '3D' | 'MIXED' = 'AUTO';

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

  // New methods for 3D rendering
  setRenderMode(mode: 'AUTO' | '2D' | '3D' | 'MIXED'): void {
    this.renderMode = mode;
  }

  setCamera3D(camera: Camera3DComponent): void {
    this.camera3D = camera;
  }

  getCamera3D(): Camera3DComponent {
    return this.camera3D;
  }

  getGlobalUniforms(): GlobalUniforms {
    return this.globalUniforms;
  }

  updateGlobalUniforms(): void {
    if (!this.camera3D) return;

    this.globalUniforms.viewMatrix = this.camera3D.getViewMatrix();
    this.globalUniforms.projectionMatrix = this.camera3D.getProjectionMatrix();
    this.globalUniforms.viewProjectionMatrix = this.camera3D.getViewProjectionMatrix();
    this.globalUniforms.cameraPosition = this.camera3D.position;
    // Assuming cameraDirection can be derived or is explicitly set on Camera3D
    // For simplicity, using a placeholder for now
    // this.globalUniforms.cameraDirection = this.camera3D.forwardVector;
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

  getDevicePixelRatio(): number {
    return this.dpr;
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
    this.clear();

    const viewportData: ViewportData = {
      x: this.viewport[0],
      y: this.viewport[1],
      width: this.viewport[2],
      height: this.viewport[3],
    };

    const renderContext: RenderContext = {
      camera: this.camera3D, // Assuming camera3D is initialized
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

  private clear(): void {
    this.renderer.clear();
  }

  private updateCamera(): void {
    // Update 3D camera if in 3D or MIXED mode
    if (this.renderMode === '3D' || this.renderMode === 'MIXED') {
      // Logic to update camera3D based on cameraTargetId or other factors
      // For now, this is a placeholder. Real implementation would involve using Transform3DComponent.
      if (this.cameraTargetId) {
        const targetEntity = this.world.getEntityById(this.cameraTargetId);
        if (targetEntity) {
          const transform3D = targetEntity.getComponent<Transform3DComponent>('Transform3D');
          if (transform3D) {
            // Assuming camera3D exists and has a lookAt method
            this.camera3D.lookAt(transform3D.position);
            // Update camera position based on offset or other logic
            // For now, just setting camera position to target position + some offset
            const offset: [number, number, number] = [0, 5, 10]; // Example offset
            this.camera3D.position = [
              transform3D.position[0] + offset[0],
              transform3D.position[1] + offset[1],
              transform3D.position[2] + offset[2],
            ];
          }
        }
      }
    }
  }

  private updateCameraOffset(): void {
    // This method is 2D specific and will not be used in WebGPURenderSystem
    // Leaving it as a no-op for now to avoid compilation errors if called.
  }

  onDestroy(): void {
    this.renderer.onDestroy();
  }

  // Add method to get grid debug layer (may or may not be relevant for 3D)
  getGridDebugLayer(): IRenderLayer | undefined {
    return undefined; // Or implement 3D grid debug logic
  }
}
