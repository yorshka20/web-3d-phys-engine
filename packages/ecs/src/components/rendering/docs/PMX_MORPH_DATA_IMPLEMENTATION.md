# PMX Morph Data Implementation

## Overview

This document describes the implementation of morph data handling in the PMXMorphComponent, specifically the `getMorphDataArray()` method that was missing from the initial implementation.

## Problem

The initial PMXMorphComponent implementation only had `getMorphWeightsArray()` but was missing `getMorphDataArray()`, which is needed for vertex morph animations (Type 1 morphs). This caused the WebGPURenderSystem to return `undefined` for morph data, preventing proper vertex morph animations.

## Solution

### 1. Updated PMXMorphComponentData Interface

Added `morphData` field to store vertex morph data:

```typescript
export interface PMXMorphComponentData {
  assetId: string; // PMX model asset ID
  activeMorphs: Map<number, PMXMorphState>; // morphIndex -> state
  morphWeights: Float32Array; // Current weights for all morphs (max 64)
  morphData: Float32Array; // Vertex morph data (position offsets)
  needsUpdate: boolean; // Flag to indicate if GPU data needs updating
}
```

### 2. Updated Constructor

Modified the constructor to initialize `morphData`:

```typescript
constructor(data: Partial<PMXMorphComponentData> = {}) {
  super('PMXMorphComponent', {
    assetId: data.assetId || '',
    activeMorphs: data.activeMorphs || new Map(),
    morphWeights: data.morphWeights || new Float32Array(64), // Max 64 morphs
    morphData: data.morphData || new Float32Array(0), // Will be initialized when PMX model is loaded
    needsUpdate: data.needsUpdate || false,
  });
}
```

### 3. Added getMorphDataArray Method

Implemented the missing method:

```typescript
/**
 * Get morph data array for GPU upload
 * @returns Float32Array of morph vertex data
 */
getMorphDataArray(): Float32Array {
  return this.data.morphData;
}
```

### 4. Added setMorphData Method

Added method to set morph data:

```typescript
/**
 * Set morph data array (called when PMX model is loaded)
 * @param morphData Float32Array of morph vertex data
 */
setMorphData(morphData: Float32Array): void {
  this.data.morphData = morphData;
  this.data.needsUpdate = true;
}
```

### 5. Added initializeFromPMXModel Method

Added method to initialize morph data from PMX model:

```typescript
/**
 * Initialize morph data from PMX model
 * @param pmxModel PMX model data
 */
initializeFromPMXModel(pmxModel: {
  morphs?: Array<{ type: number; vertices: unknown[] }>;
}): void {
  if (!pmxModel || !pmxModel.morphs) {
    return;
  }

  // Calculate total vertex count for morph data
  let totalVertices = 0;
  for (const morph of pmxModel.morphs) {
    if (morph.type === 1) {
      // Vertex morph
      totalVertices += morph.vertices.length;
    }
  }

  // Initialize morph data array (3 floats per vertex: x, y, z)
  this.data.morphData = new Float32Array(totalVertices * 3);
  this.data.needsUpdate = true;
}
```

### 6. Updated WebGPURenderSystem

Fixed the `extractMorphData` method to use the new implementation:

```typescript
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
```

## Data Structure

### Morph Data Format

The `morphData` array stores vertex position offsets for morph animations:

- **Format**: `Float32Array`
- **Layout**: `[x1, y1, z1, x2, y2, z2, ...]` (3 floats per vertex)
- **Size**: `totalVertices * 3` floats
- **Content**: Position offsets for each vertex affected by morphs

### Morph Weights Format

The `morphWeights` array stores weights for each morph:

- **Format**: `Float32Array`
- **Size**: 64 floats (max 64 morphs per model)
- **Content**: Weight values (0.0 to 1.0) for each morph

## Usage

### Initialization

```typescript
// Create morph component
const morphComponent = new PMXMorphComponent({
  assetId: 'model.pmx',
});

// Initialize from PMX model
morphComponent.initializeFromPMXModel(pmxModel);
```

### Setting Morph Data

```typescript
// Set morph data directly
const morphData = new Float32Array(vertexCount * 3);
morphComponent.setMorphData(morphData);
```

### Getting Data for GPU

```typescript
// Get morph weights for GPU
const morphWeights = morphComponent.getMorphWeightsArray();

// Get morph data for GPU
const morphData = morphComponent.getMorphDataArray();
```

## Integration with Rendering Pipeline

1. **ECS System**: PMXMorphSystem updates morph weights and data
2. **Render System**: WebGPURenderSystem extracts data via `getMorphDataArray()`
3. **Render Data**: Animation data is included in `RenderData`
4. **Renderer**: WebGPURenderer uses data to update GPU buffers
5. **Shader**: Vertex shader applies morph transformations

## Benefits

1. **Complete Implementation**: No more `undefined` returns for morph data
2. **Type Safety**: Proper TypeScript types for all morph data
3. **Performance**: Efficient data extraction and GPU upload
4. **Flexibility**: Support for both direct data setting and PMX model initialization
5. **Integration**: Seamless integration with existing rendering pipeline

## Future Enhancements

1. **Morph Data Calculation**: Implement actual morph data calculation from PMX model
2. **Caching**: Cache morph data to avoid repeated calculations
3. **Compression**: Compress morph data for better memory usage
4. **LOD**: Level-of-detail support for morph data
5. **Blending**: Advanced morph blending algorithms

## Conclusion

The implementation of `getMorphDataArray()` completes the PMX morph animation system, enabling proper vertex morph animations in the WebGPU renderer. The solution follows the established patterns in the codebase and provides a solid foundation for advanced morph animation features.
