# PhysicsComponent 3D Support Update

This document describes the updates made to `PhysicsComponent` to support 3D velocity while maintaining backward compatibility with existing 2D code.

## Changes Made

### 1. Velocity Storage

- **Before**: `velocity: Vec2` (2D only)
- **After**: `velocity: Vec3` (3D with backward compatibility)

### 2. Constructor Updates

- Now accepts both `Vec2` and `Vec3` for velocity initialization
- Automatically converts `Vec2` to `Vec3` by setting Z component to 0
- Maintains existing behavior for 2D entities

### 3. Method Updates

#### `getVelocity()`

- **Before**: Returns `Vec2`
- **After**: Returns `Vec3`
- **New**: `getVelocity2D()` returns `Vec2` for backward compatibility

#### `setVelocity(velocity)`

- **Before**: Accepts only `Vec2`
- **After**: Accepts both `Vec2` and `Vec3`
- When `Vec2` is provided, preserves existing Z component
- When `Vec3` is provided, uses all three components

#### `stop()`

- **Before**: Sets X and Y to 0
- **After**: Sets X, Y, and Z to 0

### 4. Collision Handling

- **Existing**: `handleCollision(collisionNormal)` - 2D collision (ignores Z)
- **New**: `handleCollision3D(collisionNormal)` - 3D collision (includes Z)

### 5. Speed Calculations

- All speed calculations now use 3D magnitude: `sqrt(x² + y² + z²)`
- Sleep logic updated to consider 3D velocity
- Speed limiting applies to 3D velocity

## Backward Compatibility

### 2D Code Compatibility

```typescript
// This still works exactly as before
const physics = new PhysicsComponent({
  velocity: [5, 10], // Vec2 - automatically converted to [5, 10, 0]
});

physics.setVelocity([3, 7]); // Vec2 - Z component preserved
const velocity2D = physics.getVelocity2D(); // Returns [3, 7]
```

### 3D Code Support

```typescript
// New 3D support
const physics = new PhysicsComponent({
  velocity: [5, 10, 2], // Vec3 - stored as-is
});

physics.setVelocity([3, 7, 1]); // Vec3 - all components used
const velocity3D = physics.getVelocity(); // Returns [3, 7, 1]

// 3D collision handling
physics.handleCollision3D({ x: 0, y: 1, z: 0 }); // 3D collision
```

## Migration Guide

### For Existing 2D Code

- **No changes required** - all existing code continues to work
- Optional: Use `getVelocity2D()` for explicit 2D access
- Optional: Use `handleCollision3D()` for 3D collision detection

### For New 3D Code

- Use `Vec3` for velocity initialization and updates
- Use `getVelocity()` to get full 3D velocity
- Use `handleCollision3D()` for 3D collision handling

## Benefits

1. **Unified Physics System**: Single component handles both 2D and 3D physics
2. **Backward Compatibility**: No breaking changes to existing code
3. **Performance**: No overhead for 2D entities (Z component is 0)
4. **Flexibility**: Easy to upgrade 2D entities to 3D when needed
5. **Consistency**: Same physics behavior across 2D and 3D systems

## Usage Examples

### 2D Entity (Existing Pattern)

```typescript
const player2D = world.createEntity('player2d');
player2D.addComponent(
  world.createComponent(PhysicsComponent, {
    velocity: [5, 0], // 2D velocity
    speed: 10,
    entityType: 'PLAYER',
  }),
);

// Movement in 2D
physics.setVelocity([3, 4]); // 2D movement
const currentVelocity = physics.getVelocity2D(); // [3, 4]
```

### 3D Entity (New Pattern)

```typescript
const player3D = world.createEntity('player3d');
player3D.addComponent(
  world.createComponent(PhysicsComponent, {
    velocity: [5, 0, 2], // 3D velocity
    speed: 10,
    entityType: 'PLAYER',
  }),
);

// Movement in 3D
physics.setVelocity([3, 4, 1]); // 3D movement
const currentVelocity = physics.getVelocity(); // [3, 4, 1]
```

### Mixed Usage

```typescript
// Start with 2D
const physics = new PhysicsComponent({ velocity: [5, 0] });

// Later upgrade to 3D
physics.setVelocity([5, 0, 2]); // Add Z component
// Now it's a 3D entity
```

## Technical Details

### Memory Impact

- Minimal memory overhead (one additional float per entity)
- No performance impact for 2D entities
- 3D calculations are only performed when Z component is non-zero

### Type Safety

- TypeScript provides compile-time checking for Vec2 vs Vec3 usage
- Runtime conversion handles mixed usage gracefully
- Clear method names distinguish 2D vs 3D operations

This update enables seamless integration between 2D and 3D physics systems while maintaining full backward compatibility.
