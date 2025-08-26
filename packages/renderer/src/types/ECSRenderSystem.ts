import { Entity, World } from '@ecs';
import {
  Camera3DComponent,
  LightSource3DComponent,
  Render3DComponent,
  Transform3DComponent,
} from '@ecs/components';
import { Component } from '@ecs/core/ecs/Component';
import { RenderContext } from '@renderer/webGPU/types';
import {
  DebugInfo,
  ECSScene,
  PBRMaterial,
  RenderStats,
  WebGPUMesh,
} from '../webGPU/renderer/types/WebGPUTypes';

// ===== ECS Render System Interface =====

/**
 * ECS-oriented render system interface
 * Provides high-level rendering operations for ECS entities
 */
export interface IECSRenderSystem {
  // ===== System Lifecycle =====
  initialize(canvas: HTMLCanvasElement): Promise<void>;
  destroy(): void;

  // ===== ECS Integration =====
  setWorld(world: World): void;
  getWorld(): World | null;

  // ===== Scene Management =====
  createScene(id: string, name: string): ECSScene;
  destroyScene(sceneId: string): void;
  setActiveScene(sceneId: string): void;
  getActiveScene(): ECSScene | null;

  // ===== Entity Rendering =====
  renderEntity(entity: Entity): void;
  renderEntities(entities: Entity[]): void;
  renderScene(scene: ECSScene): void;

  // ===== Component Processing =====
  processTransformComponent(entity: Entity, transform: Transform3DComponent): void;
  processRenderComponent(entity: Entity, render: Render3DComponent): void;
  processCameraComponent(entity: Entity, camera: Camera3DComponent): void;
  processLightComponent(entity: Entity, light: LightSource3DComponent): void;

  // ===== Resource Management =====
  createMaterialFromComponent(render: Render3DComponent): PBRMaterial;
  createMeshFromComponent(meshComponent: Any): WebGPUMesh; // Mesh3DComponent
  updateEntityResources(entity: Entity): void;

  // ===== Frame Management =====
  beginFrame(): void;
  endFrame(): void;
  render(deltaTime: number, context: RenderContext): void;

  // ===== Performance & Debug =====
  getRenderStats(): RenderStats;
  getDebugInfo(): DebugInfo;
  setDebugMode(enabled: boolean): void;
}

// ===== ECS Render Query Interface =====

/**
 * ECS query interface for rendering
 * Provides efficient entity queries for rendering operations
 */
export interface IECSRenderQueries {
  // ===== Entity Queries =====
  queryRenderableEntities(): Entity[];
  queryVisibleEntities(): Entity[];
  queryEntitiesInFrustum(camera: Camera3DComponent): Entity[];
  queryEntitiesInRange(position: [number, number, number], radius: number): Entity[];

  // ===== Component Queries =====
  queryEntitiesWithTransform(): Entity[];
  queryEntitiesWithRender(): Entity[];
  queryEntitiesWithMesh(): Entity[];
  queryEntitiesWithCamera(): Entity[];
  queryEntitiesWithLight(): Entity[];

  // ===== Spatial Queries =====
  queryEntitiesInBounds(bounds: {
    min: [number, number, number];
    max: [number, number, number];
  }): Entity[];

  // ===== Layer Queries =====
  queryEntitiesInLayer(layer: number): Entity[];
  queryEntitiesInLayers(layers: number[]): Entity[];

  // ===== Material Queries =====
  queryEntitiesWithMaterial(materialId: string): Entity[];
  queryEntitiesWithShader(shaderId: string): Entity[];
}

// ===== ECS Render Pipeline Interface =====

/**
 * ECS render pipeline interface
 * Manages rendering pipeline for ECS entities
 */
export interface IECSRenderPipeline {
  // ===== Pipeline Management =====
  createPipeline(name: string, config: RenderPipelineConfig): void;
  destroyPipeline(name: string): void;
  setActivePipeline(name: string): void;
  getActivePipeline(): string | null;

  // ===== Pass Management =====
  addRenderPass(pass: ECSRenderPass): void;
  removeRenderPass(passId: string): void;
  reorderRenderPasses(passIds: string[]): void;

  // ===== Pipeline Execution =====
  executePipeline(scene: ECSScene, camera: Camera3DComponent): void;
  executePass(passId: string, entities: Entity[]): void;
}

// ===== ECS Render Pass Interface =====

/**
 * ECS render pass interface
 * Defines a single rendering pass for ECS entities
 */
export interface ECSRenderPass {
  id: string;
  name: string;
  enabled: boolean;
  order: number;

  // ===== Pass Configuration =====
  targetScene?: string; // Scene ID to render
  entityFilter?: (entity: Entity) => boolean;
  componentFilter?: string[]; // Required component names

  // ===== Rendering Logic =====
  setup?(context: RenderContext): void;
  render(entities: Entity[], context: RenderContext): void;
  cleanup?(): void;

  // ===== State Management =====
  getState(): RenderPassState;
  setState(state: Partial<RenderPassState>): void;
}

// ===== Configuration Types =====

/**
 * Render pipeline configuration
 */
export interface RenderPipelineConfig {
  name: string;
  passes: ECSRenderPass[];
  defaultScene?: string;
  enableFrustumCulling?: boolean;
  enableOcclusionCulling?: boolean;
  enableInstancing?: boolean;
  maxDrawCalls?: number;
  maxInstances?: number;
}

/**
 * Render pass state
 */
export interface RenderPassState {
  pipeline: string;
  bindGroups: Map<string, Any>; // WebGPUBindGroup
  uniforms: Map<string, Any>; // WebGPUBuffer
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scissor: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ===== ECS Render Manager Interface =====

/**
 * ECS render manager interface
 * Coordinates all rendering operations for ECS
 */
export interface IECSRenderManager {
  // ===== System Management =====
  registerSystem(system: IECSRenderSystem): void;
  unregisterSystem(systemId: string): void;
  getSystem(systemId: string): IECSRenderSystem | null;

  // ===== Pipeline Management =====
  registerPipeline(pipeline: IECSRenderPipeline): void;
  unregisterPipeline(pipelineId: string): void;
  getPipeline(pipelineId: string): IECSRenderPipeline | null;

  // ===== Query Management =====
  registerQueries(queries: IECSRenderQueries): void;
  unregisterQueries(queriesId: string): void;
  getQueries(queriesId: string): IECSRenderQueries | null;

  // ===== Global Operations =====
  renderAllScenes(): void;
  updateAllResources(): void;
  cleanupAllResources(): void;

  // ===== Performance Monitoring =====
  getGlobalStats(): {
    systems: number;
    pipelines: number;
    queries: number;
    totalEntities: number;
    totalDrawCalls: number;
    totalTriangles: number;
  };
}

// ===== ECS Render Event Types =====

/**
 * ECS render events
 */
export interface ECSRenderEvents {
  // ===== Entity Events =====
  onEntityAdded: (entity: Entity) => void;
  onEntityRemoved: (entity: Entity) => void;
  onEntityUpdated: (entity: Entity, component: Component) => void;

  // ===== Scene Events =====
  onSceneCreated: (scene: ECSScene) => void;
  onSceneDestroyed: (sceneId: string) => void;
  onSceneActivated: (scene: ECSScene) => void;

  // ===== Render Events =====
  onFrameBegin: (deltaTime: number) => void;
  onFrameEnd: (stats: RenderStats) => void;
  onPassBegin: (pass: ECSRenderPass) => void;
  onPassEnd: (pass: ECSRenderPass) => void;

  // ===== Resource Events =====
  onResourceCreated: (type: string, id: string) => void;
  onResourceDestroyed: (type: string, id: string) => void;
  onResourceUpdated: (type: string, id: string) => void;
}

// ===== ECS Render Configuration =====

/**
 * ECS render system configuration
 */
export interface ECSRenderConfig {
  // ===== System Settings =====
  enableFrustumCulling: boolean;
  enableOcclusionCulling: boolean;
  enableInstancing: boolean;
  enableBatching: boolean;

  // ===== Performance Limits =====
  maxDrawCalls: number;
  maxInstances: number;
  maxLights: number;
  maxTextures: number;

  // ===== Quality Settings =====
  shadowMapSize: number;
  shadowCascadeCount: number;
  maxAnisotropy: number;
  enableMSAA: boolean;
  msaaSamples: number;

  // ===== Debug Settings =====
  enableDebugMode: boolean;
  enableWireframe: boolean;
  enableBoundingBoxes: boolean;
  enableStatistics: boolean;

  // ===== Resource Settings =====
  enableResourceCaching: boolean;
  enableHotReload: boolean;
  maxCachedResources: number;
}
