# PhysicsSystem 3D Support Update

This document describes the updates made to `PhysicsSystem` to support 3D entities with `Transform3DComponent` while maintaining backward compatibility with existing 2D entities.

## Changes Made

### 1. Dual Entity Processing

- **Before**: Only processed entities with `TransformComponent` (2D)
- **After**: Processes both 2D and 3D entities separately
  - 2D entities: `PhysicsComponent` + `TransformComponent`
  - 3D entities: `PhysicsComponent` + `Transform3DComponent`

### 2. Sleep State Management

- **2D Sleep State**: `updateSleepState()` - uses 2D velocity magnitude
- **3D Sleep State**: `updateLinearVelocity3D()` - uses 3D velocity magnitude

### 3. Velocity Integration

- **2D Integration**: `updateLinearVelocity()` - integrates X and Y components
- **3D Integration**: `updateLinearVelocity3D()` - integrates X, Y, and Z components

### 4. System Architecture

```typescript
update(deltaTime: number): void {
  // Handle 2D entities
  const entities2D = this.world.getEntitiesWithComponents([PhysicsComponent, TransformComponent]);
  for (const entity of entities2D) {
    this.updateSleepState(entity, deltaTime);
    if (entity.hasComponent(SpiralMovementComponent.componentName)) {
      this.updateSpiralVelocity(entity, deltaTime);
    } else {
      this.updateLinearVelocity(entity, deltaTime);
    }
  }

  // Handle 3D entities
  const entities3D = this.world.getEntitiesWithComponents([PhysicsComponent, Transform3DComponent]);
  for (const entity of entities3D) {
    this.updateSleepState3D(entity, deltaTime);
    this.updateLinearVelocity3D(entity, deltaTime);
  }
}
```

## Key Features

### 1. Backward Compatibility

- All existing 2D entities continue to work without changes
- 2D spiral movement is preserved
- 2D viewport clamping is maintained

### 2. 3D Support

- Full 3D velocity integration (X, Y, Z)
- 3D sleep state management
- 3D position updates

### 3. Performance

- Separate processing loops for 2D and 3D entities
- No overhead for 2D entities
- Efficient component queries

## Usage

### 2D Entity (Existing)

```typescript
const entity2D = world.createEntity('entity2d');
entity2D.addComponent(
  world.createComponent(PhysicsComponent, {
    velocity: [5, 0], // 2D velocity
    speed: 10,
  }),
);
entity2D.addComponent(
  world.createComponent(TransformComponent, {
    position: [0, 0],
  }),
);
world.addEntity(entity2D);
```

### 3D Entity (New)

```typescript
const entity3D = world.createEntity('entity3d');
entity3D.addComponent(
  world.createComponent(PhysicsComponent, {
    velocity: [5, 0, 2], // 3D velocity
    speed: 10,
  }),
);
entity3D.addComponent(
  world.createComponent(Transform3DComponent, {
    position: [0, 0, 0],
  }),
);
world.addEntity(entity3D);
```

## System Integration

### Required Systems

```typescript
// Add PhysicsSystem to your world
world.addSystem(new PhysicsSystem());

// For 3D entities, also add Transform3DSystem
world.addSystem(new Transform3DSystem());
```

### System Order

1. **Input3DSystem** - Handles input and sets velocity
2. **Transform3DSystem** - Processes input and updates velocity
3. **PhysicsSystem** - Integrates velocity into position
4. **WebGPURenderSystem** - Renders entities

## Differences Between 2D and 3D Processing

| Feature         | 2D Processing                             | 3D Processing                               |
| --------------- | ----------------------------------------- | ------------------------------------------- |
| Components      | `PhysicsComponent` + `TransformComponent` | `PhysicsComponent` + `Transform3DComponent` |
| Velocity        | 2D magnitude `sqrt(x² + y²)`              | 3D magnitude `sqrt(x² + y² + z²)`           |
| Position        | Updates X, Y                              | Updates X, Y, Z                             |
| Clamping        | Viewport bounds                           | No bounds (can be added)                    |
| Spiral Movement | Supported                                 | Not supported (2D only)                     |

## Camera Movement Fix

The camera movement issue was caused by missing `PhysicsSystem` in the main.ts. The camera entity has:

- `PhysicsComponent` with 3D velocity
- `Transform3DComponent` for 3D position
- `Input3DComponent` for input handling

But without `PhysicsSystem`, the velocity was never integrated into position updates.

### Solution

```typescript
// Add PhysicsSystem to enable camera movement
world.addSystem(new PhysicsSystem());
```

## Technical Details

### Sleep State Logic

- **2D**: Uses `getVelocity2D()` for 2D magnitude calculation
- **3D**: Uses `getVelocity()` for 3D magnitude calculation
- Both use the same sleep thresholds and timers

### Position Integration

- **2D**: `position += velocity * deltaTime` for X, Y
- **3D**: `position += velocity * deltaTime` for X, Y, Z
- Both respect entity sleep state

### Performance Considerations

- Separate entity queries for 2D and 3D entities
- No unnecessary processing of 3D entities in 2D loops
- Efficient component access patterns

This update enables full 3D physics support while maintaining complete backward compatibility with existing 2D systems.
