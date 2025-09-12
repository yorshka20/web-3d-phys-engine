# Asset Loading Architecture Implementation

## Overview

This document describes the implementation of the asset loading architecture based on the design principles outlined in `asset-loading-design.md`. The implementation follows the separation of concerns principle, separating asset loading from GPU resource creation.

## Architecture Components

### 1. Asset Loading Layer

#### AssetLoader (`packages/renderer/src/webGPU/core/AssetLoader.ts`)

- **Responsibility**: File loading and CPU data storage only
- **No GPU dependencies**: Does not create GPU resources
- **Features**:
  - Load PMX models from URL or File
  - Load textures from URL or File
  - Parse PMX files using mmd-parser
  - Register assets with AssetRegistry

#### AssetRegistry (`packages/renderer/src/webGPU/core/AssetRegistry.ts`)

- **Responsibility**: CPU resource management and reference counting
- **Features**:
  - Store loaded asset descriptors
  - Manage asset references and dependencies
  - Track memory usage
  - Handle asset lifecycle (addRef/releaseRef)

### 2. ECS Component Layer

#### PMXMeshComponent (`packages/ecs/src/components/rendering/PMXMeshComponent.ts`)

- **Responsibility**: Hold asset references, not GPU resources
- **Features**:
  - Reference asset by ID
  - Lazy asset resolution
  - Reference counting integration
  - GPU resource placeholder (created on-demand)

### 3. Rendering Integration

#### WebGPURenderSystem (`packages/ecs/src/systems/rendering/WebGPURenderSystem.ts`)

- **Enhanced**: Added support for PMXMeshComponent
- **Process**: Extract PMX mesh data and create RenderData with PMX-specific fields

#### WebGPURenderer (`packages/renderer/src/webGPU/renderer/WebGPURenderer.ts`)

- **Enhanced**: Added PMX geometry creation in renderObject()
- **Process**:
  1. Check if renderable is PMX model
  2. Get asset data from registry
  3. Convert PMX data to GeometryData
  4. Use existing GeometryManager for GPU resource creation

## Data Flow

```
1. Asset Loading Phase:
   AssetLoader.loadPMXModel() → AssetRegistry.register() → CPU data stored

2. ECS Phase:
   Entity.addComponent(PMXMeshComponent) → Component holds asset reference

3. Rendering Phase:
   WebGPURenderSystem.extractEntityRenderData() → Creates RenderData with PMX info
   WebGPURenderer.renderObject() → Detects PMX model → Gets asset data → Creates GPU geometry

4. GPU Resource Creation:
   convertPMXToGeometryData() → GeometryManager.getGeometryFromData() → GPU buffers created
```

## Key Design Principles

### 1. Separation of Concerns

- **Asset Loading**: Only handles file I/O and parsing
- **GPU Resource Creation**: Only happens during rendering
- **ECS Components**: Only hold references, not resources

### 2. Lazy Loading

- Assets are loaded when needed
- GPU resources are created on-demand during rendering
- Reference counting manages resource lifecycle

### 3. Type Safety

- Proper TypeScript types for PMX data structures
- No `any` types in critical paths
- Type-safe asset references

### 4. Integration with Existing Systems

- Uses existing GeometryManager for GPU resource creation
- Integrates with existing rendering pipeline
- Minimal changes to existing code

## Usage Example

```typescript
// 1. Load PMX model
await AssetLoader.loadPMXModelFromURL('/models/character.pmx', 'character_model');

// 2. Create entity with PMX component
const entity = world.createEntity();
entity.addComponent(new PMXMeshComponent('character_model'));
entity.addComponent(new Transform3DComponent({ position: [0, 0, 0] }));
entity.addComponent(new WebGPU3DRenderComponent({ material: basicMaterial }));

// 3. Rendering happens automatically
// - WebGPURenderSystem detects PMXMeshComponent
// - WebGPURenderer creates GPU geometry on-demand
// - Model is rendered using existing pipeline
```

## Benefits

1. **Memory Efficiency**: GPU resources only created when needed
2. **Performance**: Asset loading doesn't block rendering
3. **Maintainability**: Clear separation of responsibilities
4. **Scalability**: Easy to add new asset types
5. **Type Safety**: Compile-time error checking

## Future Enhancements

1. **Texture Loading**: Extend to support PMX model textures
2. **Material Support**: Create materials from PMX data
3. **Animation**: Add skeletal animation support
4. **LOD**: Implement level-of-detail for large models
5. **Streaming**: Add progressive loading for large assets
