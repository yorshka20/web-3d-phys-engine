# 3D Components Architecture Overview

This document provides an overview of the 3D component architecture for the WebGPU-based ECS rendering engine.

## Core 3D Components

### 1. Mesh3DComponent

**Location**: `packages/ecs/src/components/physics/shape/Mesh3DComponent.ts`

**Purpose**: Describes 3D geometric data including vertices, indices, and primitive types.

**Key Features**:

- Support for basic geometric shapes (box, sphere, cylinder, plane, cone)
- Custom mesh support with vertex and index data
- Bounding box calculation and caching
- Tessellation and dirty state management
- WebGPU primitive type support

**Usage Example**:

```typescript
const boxMesh = Mesh3DComponent.createBox(1, 1, 1);
const sphereMesh = Mesh3DComponent.createSphere(0.5, 32);
const customMesh = Mesh3DComponent.createMesh(vertices, indices);
```

### 2. Transform3DComponent

**Location**: `packages/ecs/src/components/physics/Transform3DComponent.ts`

**Purpose**: Manages 3D transformation data including position, rotation, and scale.

**Key Features**:

- 3D position, rotation (Euler angles), and scale
- Fixed and recyclable entity support
- Movement and rotation methods
- Scale operations

**Usage Example**:

```typescript
const transform = new Transform3DComponent({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
```

### 3. Render3DComponent

**Location**: `packages/ecs/src/components/rendering/Render3DComponent.ts`

**Purpose**: Manages 3D rendering properties including materials, textures, and shaders.

**Key Features**:

- PBR material support (albedo, metallic, roughness, emissive)
- Texture mapping support
- Shadow casting and receiving
- Custom shader support
- Render layer management

**Usage Example**:

```typescript
const material = Render3DComponent.createBasicMaterial({ r: 1, g: 0, b: 0, a: 1 });
const render3D = new Render3DComponent({
  material,
  castShadow: true,
  receiveShadow: true,
});
```

### 4. Camera3DComponent (Enhanced)

**Location**: `packages/ecs/src/components/rendering/Camera3DComponent.ts`

**Purpose**: Manages 3D camera properties and projection settings with enhanced WebGPU support.

**Key Features**:

- Perspective and orthographic projection modes
- Camera modes (topdown, sideview, custom)
- Field of view and aspect ratio control
- View bounds and resolution settings
- Ray generation for ray tracing
- **Enhanced 3D support**: Look-at target, up vector, projection/view matrices
- **WebGPU compatibility**: Matrix generation for rendering pipeline

**Usage Example**:

```typescript
// Create perspective camera
const camera = Camera3DComponent.createPerspectiveCamera(75, 16 / 9);

// Create orthographic camera
const orthoCamera = Camera3DComponent.createOrthographicCamera(-1, 1, 1, -1);

// Set camera to look at target
camera.lookAt([0, 0, 0], [0, 1, 0]);
```

### 5. LightSourceComponent (Enhanced)

**Location**: `packages/ecs/src/components/rendering/LightSourceComponent.ts`

**Purpose**: Manages 3D lighting properties and behavior with enhanced WebGPU support.

**Key Features**:

- Multiple light types (point, directional, ambient, spot)
- Attenuation models
- Shadow casting support
- 3D positioning and direction
- Light layers for rendering
- **Enhanced 3D support**: Range, shadow map size, shadow bias
- **Animation support**: Flicker effects for dynamic lighting
- **WebGPU compatibility**: Normalized color values, 3D position/direction methods

**Usage Example**:

```typescript
// Create directional light (sun)
const sunLight = LightSourceComponent.createSunLight();

// Create point light
const pointLight = LightSourceComponent.createPointLight({ r: 255, g: 255, b: 255, a: 1 }, 1, 10);

// Create fire light with flicker
const fireLight = LightSourceComponent.createFireLight();

// Set light position in 3D space
pointLight.setPosition3D([0, 5, 0]);
```

## Component Relationships

### Rendering Pipeline

1. **Mesh3DComponent** provides geometric data
2. **Transform3DComponent** provides transformation matrices
3. **Render3DComponent** provides material and rendering properties
4. **Camera3DComponent** provides view and projection matrices
5. **LightSourceComponent** provides lighting information

### Entity Composition Example

```typescript
// Create a 3D cube entity
const cubeEntity = world.createEntity();
cubeEntity.addComponent(Mesh3DComponent.createBox(1, 1, 1));
cubeEntity.addComponent(
  new Transform3DComponent({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }),
);
cubeEntity.addComponent(
  new Render3DComponent({
    material: Render3DComponent.createBasicMaterial({ r: 1, g: 0, b: 0, a: 1 }),
  }),
);

// Create a 3D scene with camera and lights
const cameraEntity = world.createEntity();
cameraEntity.addComponent(Camera3DComponent.createMainCamera());
cameraEntity.addComponent(
  new Transform3DComponent({
    position: [0, 0, 5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }),
);

const lightEntity = world.createEntity();
lightEntity.addComponent(LightSourceComponent.createSunLight());
lightEntity.addComponent(
  new Transform3DComponent({
    position: [0, 10, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }),
);
```

## Integration with WebGPU

All 3D components are designed to work seamlessly with WebGPU:

- **Mesh3DComponent**: Provides vertex and index buffers for WebGPU
- **Transform3DComponent**: Provides uniform buffer data for transformation matrices
- **Render3DComponent**: Provides material uniforms and texture bindings
- **Camera3DComponent**: Provides view and projection matrices
- **LightSourceComponent**: Provides light uniforms for shaders

## Future Enhancements

1. **Animation Support**: Add animation components for skeletal and morph target animations
2. **Particle Systems**: Add particle system components for effects
3. **Terrain Components**: Add terrain and heightmap support
4. **Audio Components**: Add 3D spatial audio support
5. **Physics Integration**: Enhanced collision detection and physics simulation

## Usage Guidelines

1. **Component Separation**: Keep geometry (Mesh3D), transformation (Transform3D), and rendering (Render3D) separate
2. **Performance**: Use component pooling and dirty state management for efficient updates
3. **Memory Management**: Properly reset components when recycling entities
4. **Type Safety**: Use TypeScript interfaces for component properties
5. **WebGPU Compatibility**: Ensure all components work with WebGPU's data structures
