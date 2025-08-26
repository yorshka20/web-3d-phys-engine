# WebGPU Renderer Interface Design

## Overview

This document describes the optimized WebGPU renderer interface design for the ECS-based 3D physics engine. The design provides a clean separation between high-level game logic and low-level WebGPU operations, with strong ECS integration.

## Architecture

### Interface Layers

The renderer interface is organized into three main layers:

1. **High-Level Interface (`IRenderer`)**: Game logic and scene management
2. **Low-Level Interface (`IRenderBackend`)**: Direct WebGPU operations
3. **Unified Interface (`IWebGPURenderer`)**: Combines both layers

### ECS Integration

The renderer is designed to work seamlessly with the ECS architecture:

- **Entity-based rendering**: Entities with rendering components are automatically processed
- **Component-driven**: Rendering behavior is determined by component composition
- **Scene management**: Scenes contain sets of entities for organized rendering
- **Query system**: Efficient entity queries for rendering operations

## Core Types

### Scene and Entity Types

```typescript
// Scene representation
interface Scene {
  entities: Set<number>; // Entity IDs
  name: string;
  active: boolean;
}

// Camera with ECS components
interface Camera {
  component: Camera3DComponent;
  transform: Transform3DComponent;
}

// Renderable entity
interface RenderableEntity {
  id: number;
  transform: Transform3DComponent;
  render3D?: Render3DComponent;
  mesh3D?: Mesh3DComponent;
  camera3D?: Camera3DComponent;
  light3D?: LightSource3DComponent;
}
```

### Resource Types

```typescript
// WebGPU Mesh
interface Mesh {
  id: string;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  topology: GPUPrimitiveTopology;
  vertexCount: number;
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

// PBR Material
interface Material {
  id: string;
  shaderId: string;
  albedo: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number, number];
  emissiveIntensity: number;
  textures: Map<string, GPUTexture>;
  uniforms: Map<string, GPUBuffer>;
}
```

## Usage Examples

### Basic Setup

```typescript
import { IWebGPURenderer, Scene, Camera } from '@renderer/types';

class MyWebGPURenderer extends IWebGPURenderer {
  // Implement all abstract methods
  async init(canvas: HTMLCanvasElement): Promise<void> {
    // Initialize WebGPU device and context
  }

  render(deltaTime: number, context: RenderContext): void {
    // Main rendering logic
  }

  // ... implement other abstract methods
}

// Usage
const renderer = new MyWebGPURenderer();
await renderer.init(canvas);
```

### ECS Integration

```typescript
import { World, Entity } from '@ecs/core/ecs';
import { IECSRenderSystem, ECSScene } from '@renderer/types';

class ECSWebGPURenderSystem implements IECSRenderSystem {
  private world: World | null = null;
  private activeScene: ECSScene | null = null;

  setWorld(world: World): void {
    this.world = world;
  }

  renderEntity(entity: Entity): void {
    // Process entity components and render
    const transform = entity.getComponent(Transform3DComponent);
    const render = entity.getComponent(Render3DComponent);
    const mesh = entity.getComponent(Mesh3DComponent);

    if (transform && render && mesh) {
      // Render the entity
    }
  }

  renderScene(scene: ECSScene): void {
    if (!this.world) return;

    // Query entities in scene
    const entities = this.world.getEntities(scene.entities);

    // Render each entity
    for (const entity of entities) {
      this.renderEntity(entity);
    }
  }
}
```

### Resource Management

```typescript
// Create material
const material = renderer.createMaterial({
  id: 'my-material',
  shaderId: 'pbr-shader',
  albedo: [1, 0, 0, 1], // Red
  metallic: 0.5,
  roughness: 0.3,
  emissive: [0, 0, 0, 1],
  emissiveIntensity: 0,
});

// Create mesh
const geometry = {
  id: 'cube-geometry',
  vertices: new Float32Array([
    /* vertex data */
  ]),
  indices: new Uint32Array([
    /* index data */
  ]),
  attributes: new Map(),
  vertexCount: 24,
  indexCount: 36,
};

const mesh = renderer.createMesh(geometry);

// Create texture
const texture = renderer.createTexture(imageData);
```

### Render Pipeline

```typescript
// Begin render pass
const renderPass = renderer.beginRenderPass({
  colorAttachments: [
    {
      view: colorTexture.createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
  depthStencilAttachment: {
    view: depthTexture.createView(),
    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  },
});

// Set pipeline and bind groups
renderer.setRenderPipeline(pbrPipeline);
renderer.setBindGroup(0, cameraBindGroup);
renderer.setBindGroup(1, materialBindGroup);

// Draw
renderer.drawIndexed(mesh.indexCount);

// End pass
renderPass.end();
```

## ECS Render System

### Query System

```typescript
class ECSRenderQueries implements IECSRenderQueries {
  queryRenderableEntities(): Entity[] {
    // Query entities with Transform3DComponent and Render3DComponent
    return this.world.queryEntities([Transform3DComponent, Render3DComponent]);
  }

  queryEntitiesInFrustum(camera: Camera3DComponent): Entity[] {
    // Implement frustum culling
    const entities = this.queryRenderableEntities();
    return entities.filter((entity) => {
      // Check if entity is in camera frustum
      return this.isInFrustum(entity, camera);
    });
  }
}
```

### Render Pipeline

```typescript
class ECSRenderPipeline implements IECSRenderPipeline {
  private passes: Map<string, ECSRenderPass> = new Map();

  addRenderPass(pass: ECSRenderPass): void {
    this.passes.set(pass.id, pass);
  }

  executePipeline(scene: ECSScene, camera: Camera3DComponent): void {
    // Sort passes by order
    const sortedPasses = Array.from(this.passes.values())
      .filter((pass) => pass.enabled)
      .sort((a, b) => a.order - b.order);

    // Execute each pass
    for (const pass of sortedPasses) {
      const entities = this.getEntitiesForPass(pass, scene);
      pass.render(entities, this.context);
    }
  }
}
```

## Performance Features

### Instancing

```typescript
// Instance rendering for repeated objects
const instanceData = new Float32Array([
  // Transform matrices for each instance
]);

const instanceBuffer = renderer.createBuffer({
  type: BufferType.UNIFORM,
  size: instanceData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  label: 'instance-data',
});

renderer.updateBuffer(instanceBuffer.id, instanceData);
renderer.drawIndexed(mesh.indexCount, instanceCount);
```

### Batching

```typescript
// Batch rendering for similar materials
class RenderBatch {
  private entities: Entity[] = [];
  private material: Material;

  addEntity(entity: Entity): boolean {
    const render = entity.getComponent(Render3DComponent);
    if (render.material.id === this.material.id) {
      this.entities.push(entity);
      return true;
    }
    return false;
  }

  render(renderer: IWebGPURenderer): void {
    // Set material once for all entities
    renderer.setBindGroup(1, this.material.bindGroup);

    // Render all entities in batch
    for (const entity of this.entities) {
      // Update per-entity uniforms
      this.updateEntityUniforms(entity);
      renderer.drawIndexed(entity.mesh.indexCount);
    }
  }
}
```

## Debug and Performance Monitoring

```typescript
// Get render statistics
const stats = renderer.getRenderStats();
console.log(`Frame time: ${stats.frameTime}ms`);
console.log(`Draw calls: ${stats.drawCalls}`);
console.log(`Triangles: ${stats.triangles}`);

// Debug information
const debugInfo = renderer.getDebugInfo();
console.log(`Device: ${debugInfo.deviceInfo.name}`);
console.log(`Features: ${debugInfo.supportedFeatures.join(', ')}`);

// Enable debug mode
renderer.setDebugMode(true);
```

## Best Practices

### Resource Management

1. **Reuse resources**: Create materials, meshes, and textures once and reuse them
2. **Batch rendering**: Group entities with similar materials for efficient rendering
3. **Instance rendering**: Use instancing for repeated objects
4. **LOD system**: Implement level-of-detail for distant objects

### Performance Optimization

1. **Frustum culling**: Only render entities visible to the camera
2. **Occlusion culling**: Skip rendering of occluded objects
3. **Spatial partitioning**: Use spatial data structures for efficient queries
4. **GPU memory management**: Minimize buffer updates and texture uploads

### ECS Integration

1. **Component composition**: Design components for efficient rendering queries
2. **System separation**: Keep rendering logic separate from game logic
3. **Event-driven updates**: Use events to trigger resource updates
4. **Scene organization**: Organize entities into scenes for better management

## Migration Guide

### From Old Interface

1. **Update imports**: Use new type definitions from `@renderer/types`
2. **Implement new methods**: Add required abstract methods to your renderer
3. **ECS integration**: Use `IECSRenderSystem` for ECS-based rendering
4. **Resource management**: Use new resource types and management methods

### Breaking Changes

- `createTexture` method signature changed
- Added new abstract methods for complete interface implementation
- ECS-specific interfaces added for better integration
- Resource types enhanced with metadata and management features
