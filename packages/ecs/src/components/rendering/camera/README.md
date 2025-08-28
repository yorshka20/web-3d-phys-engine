# Camera System Refactoring

This document describes the refactoring of the camera system to follow ECS architecture principles.

## Overview

The camera system has been refactored to treat cameras as proper ECS entities rather than global state managed directly by the render system. This provides better separation of concerns and follows ECS patterns.

## Architecture Changes

### 1. Camera as ECS Entity

Cameras are now proper ECS entities with the following components:

- **Camera3DComponent**: Contains camera-specific properties (FOV, projection mode, etc.)
- **Transform3DComponent**: Manages position, rotation, and scale
- **ActiveCameraTag**: Marks the active camera (only one should exist)
- **Input3DComponent**: Handles camera input controls

### 2. Camera Tag Components

Different camera types are supported through tag components:

- `ActiveCameraTag`: Main camera for rendering
- `ShadowCameraTag`: For shadow mapping
- `ReflectionCameraTag`: For reflection rendering

### 3. RenderSystem Camera Management

The `WebGPURenderSystem` now:

- Queries for camera entities instead of managing camera directly
- Finds the active camera using `ActiveCameraTag` or falls back to first camera
- Prepares camera data (view/projection matrices) from entity components
- Passes camera entity to renderer through `RenderContext`

### 4. Camera Data Preparation

The render system calculates:

- View matrix from camera position and target
- Projection matrix based on camera properties
- View-projection matrix for rendering
- Camera direction vector

## Usage Example

```typescript
// Create a camera entity
const camera = world.createEntity('camera');

// Add camera properties
camera.addComponent(
  world.createComponent(Camera3DComponent, {
    fov: 75,
    aspectRatio: 16 / 9,
    near: 0.1,
    far: 1000,
    projectionMode: 'perspective',
  }),
);

// Add transform for position/rotation
camera.addComponent(
  world.createComponent(Transform3DComponent, {
    position: [0, 5, 10],
  }),
);

// Mark as active camera
camera.addComponent(new ActiveCameraTag());

// Add input controls
camera.addComponent(
  world.createComponent(Input3DComponent, {
    mouseSensitivity: 0.1,
    moveSpeed: 5,
  }),
);

world.addEntity(camera);
```

## Benefits

1. **ECS Consistency**: Cameras follow the same patterns as other entities
2. **Flexibility**: Easy to create multiple cameras for different purposes
3. **Separation of Concerns**: Camera properties vs. transform data are clearly separated
4. **Extensibility**: Easy to add new camera types through tag components
5. **Testability**: Camera logic can be tested independently

## Migration Notes

- `Camera3DComponent.position` has been removed - use `Transform3DComponent` instead
- `Camera3DComponent.moveBy()` is deprecated - use `Transform3DComponent.move()`
- `Camera3DComponent.updateViewBounds()` now requires position parameter
- Render system methods now work with camera entities instead of camera components directly
