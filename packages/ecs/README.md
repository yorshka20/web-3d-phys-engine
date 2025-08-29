# ECS Package

A comprehensive Entity Component System (ECS) framework for WebGPU-based 3D physics engine, built with TypeScript.

## Overview

This ECS package provides a robust foundation for building complex 3D applications with WebGPU rendering, physics simulation, and game logic. It features object pooling, spatial partitioning, and a modular component architecture.

## Core Architecture

### ECS Fundamentals

- **Entity**: Game objects with unique IDs and type classification
- **Component**: Data containers that define entity properties and behavior
- **System**: Logic processors that operate on entities with specific components
- **World**: Central manager that coordinates entities, components, and systems

### Key Features

- **Object Pooling**: Memory-efficient entity and component reuse
- **Spatial Grid**: Optimized collision detection and spatial queries
- **WebGPU Integration**: Native 3D rendering support
- **Performance Monitoring**: Built-in FPS tracking and system optimization
- **Event System**: Decoupled communication between systems
- **Type Safety**: Full TypeScript support with strict typing

## Package Structure

```
src/
├── components/          # Component definitions
│   ├── core/           # Core components (Health, Stats, etc.)
│   ├── physics/        # Physics components (Transform, Collider, etc.)
│   ├── rendering/      # Rendering components (Render3D, Camera, etc.)
│   ├── interaction/    # Input and interaction components
│   ├── weapon/         # Weapon system components
│   ├── projectile/     # Projectile components
│   └── state/          # State management components
├── systems/            # System implementations
│   ├── core/           # Core systems (Lifecycle, Performance, etc.)
│   ├── physics/        # Physics systems (Movement, Collision, etc.)
│   ├── rendering/      # Rendering systems (WebGPU, Canvas2D)
│   ├── interaction/    # Input and interaction systems
│   └── state/          # State management systems
├── entities/           # Entity factories and templates
├── core/               # Core ECS framework
│   ├── ecs/            # ECS base classes (Entity, Component, System, World)
│   ├── pool/           # Object pooling system
│   ├── resources/      # Resource management
│   ├── store/          # Global state management
│   └── worker/         # Web Worker integration
├── constants/          # System priorities and configuration
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## Core Components

### Physics Components

- **Transform3DComponent**: 3D position, rotation, and scale
- **PhysicsComponent**: Velocity and acceleration
- **ColliderComponent**: Collision detection shapes
- **SpatialGridComponent**: Spatial partitioning for performance
- **ShapeComponent**: Geometric shape definitions (2D/3D)

### Rendering Components

- **WebGPU3DRenderComponent**: WebGPU rendering properties
- **Camera3DComponent**: 3D camera configuration
- **LightSource3DComponent**: Lighting setup
- **AnimationComponent**: Animation state and properties
- **Mesh3DComponent**: 3D geometric data

### Core Components

- **HealthComponent**: Entity health and damage
- **StatsComponent**: Character statistics and upgrades
- **LifecycleComponent**: Entity lifetime management
- **ExperienceComponent**: Leveling and progression
- **StateComponent**: Entity state management

### Interaction Components

- **InputComponent**: User input handling
- **PickupComponent**: Collectible item behavior
- **WeaponComponent**: Weapon system integration

## Core Systems

### Physics Systems

- **PhysicsSystem**: Movement and physics simulation
- **CollisionSystem**: Collision detection and response
- **SpatialGridSystem**: Spatial partitioning management
- **TransformSystem**: Transform matrix updates
- **BorderSystem**: Boundary handling

### Rendering Systems

- **WebGPURenderSystem**: WebGPU-based 3D rendering
- **RenderSystem**: Canvas2D rendering
- **AnimationSystem**: Animation processing

### Core Systems

- **LifecycleSystem**: Entity lifecycle management
- **PerformanceSystem**: Performance monitoring and optimization
- **RecycleSystem**: Object pool management
- **DamageSystem**: Damage calculation and application
- **DeathSystem**: Entity death processing

### State Systems

- **SpawnSystem**: Entity spawning and wave management
- **AISystem**: Artificial intelligence behavior
- **WeaponSystem**: Weapon firing and projectile management
- **PickupSystem**: Item collection and effects

## System Priorities

The framework uses a priority-based system execution order:

```typescript
export enum SystemPriorities {
  SPATIAL_GRID = 0, // Spatial partitioning
  LIFECYCLE = 100, // Entity lifecycle
  PERFORMANCE = 101, // Performance monitoring
  INPUT = 200, // Input processing
  SPAWN = 300, // Entity spawning
  AI = 400, // AI behavior
  WEAPON = 500, // Weapon systems
  PHYSICS = 700, // Physics simulation
  COLLISION = 900, // Collision detection
  DAMAGE = 901, // Damage processing
  DEATH = 1000, // Death processing
  PICKUP = 1100, // Item collection
  RENDER = 9999, // Final rendering
}
```

## Object Pooling

The ECS framework includes a sophisticated object pooling system:

- **Entity Pooling**: Reuses entity instances to reduce garbage collection
- **Component Pooling**: Efficient component memory management
- **Automatic Cleanup**: Handles entity and component recycling
- **Memory Leak Prevention**: Built-in memory leak detection

## WebGPU Integration

### 3D Rendering Pipeline

1. **Mesh3DComponent**: Provides geometric data (vertices, indices)
2. **Transform3DComponent**: Provides transformation matrices
3. **WebGPU3DRenderComponent**: Provides material and rendering properties
4. **Camera3DComponent**: Provides view and projection matrices
5. **LightSource3DComponent**: Provides lighting information

### WebGPU Features

- **PBR Materials**: Physically-based rendering support
- **Shadow Mapping**: Dynamic shadow casting and receiving
- **Custom Shaders**: Flexible shader system
- **Texture Management**: Efficient texture loading and caching
- **Buffer Management**: Optimized GPU buffer handling

## Usage Example

```typescript
import { World, SystemPriorities } from '@web-3d-phys-engine/ecs';
import {
  Transform3DComponent,
  WebGPU3DRenderComponent,
  Mesh3DComponent,
} from '@web-3d-phys-engine/ecs/components';
import { WebGPURenderSystem } from '@web-3d-phys-engine/ecs/systems';

// Create world
const world = new World();

// Add rendering system
const renderSystem = new WebGPURenderSystem();
world.addSystem(renderSystem);

// Create 3D cube entity
const cubeEntity = world.createEntity('object');
cubeEntity.addComponent(Mesh3DComponent.createBox(1, 1, 1));
cubeEntity.addComponent(
  new Transform3DComponent({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }),
);
cubeEntity.addComponent(
  new WebGPU3DRenderComponent({
    material: WebGPU3DRenderComponent.createBasicMaterial({ r: 1, g: 0, b: 0, a: 1 }),
  }),
);

// Game loop
function gameLoop(deltaTime: number) {
  world.update(deltaTime);
  requestAnimationFrame(gameLoop);
}

gameLoop(0);
```

## Development

### Install Dependencies

```bash
pnpm install
```

### Type Checking

```bash
pnpm typecheck
```

### Testing

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

### From Root Directory

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Test Coverage

The test suite covers:

- Entity pool reuse and ID uniqueness
- Component pool reuse and state isolation
- Memory leak prevention
- Object pool consistency
- ECS system integration
- Performance monitoring

## Performance Features

- **Spatial Partitioning**: Optimized collision detection
- **System Skipping**: Performance-based system execution
- **Object Pooling**: Reduced garbage collection
- **Batch Processing**: Efficient entity updates
- **Memory Monitoring**: Built-in memory leak detection

## Integration

This ECS package is designed to work seamlessly with:

- **WebGPU Renderer**: Native 3D rendering support
- **Physics Engine**: Collision detection and simulation
- **Audio System**: Sound management and effects
- **Resource Management**: Asset loading and caching
- **Worker Threads**: Background processing support

## Contributing

When contributing to this package:

1. Follow TypeScript strict mode guidelines
2. Maintain object pooling patterns
3. Add comprehensive tests for new features
4. Update documentation for API changes
5. Follow the established component/system architecture
