# Transform3DSystem

The `Transform3DSystem` is responsible for handling 3D transformations for entities in the ECS system. It provides movement, rotation, scaling, and camera control functionality for 3D entities.

## Features

### 1. 3D Movement Handling

- **Input-based Movement**: Handles WASD + Space/C movement for entities with `Input3DComponent`
- **Camera-relative Movement**: Movement is relative to the active camera's orientation
- **Physics Integration**: Supports both velocity-based (3D) and direct movement
- **Speed Multipliers**: Respects entity stats for movement speed adjustments

### 2. Camera Control

- **Mouse Look**: Handles mouse input for camera rotation (yaw, pitch, roll)
- **Camera Rotation**: Manages camera orientation and updates camera components
- **Pitch Clamping**: Prevents camera from over-rotating vertically
- **Active Camera Support**: Works with entities marked with `ActiveCameraTag`

### 3. Transform Animations

- **Position Animation**: Smooth interpolation to target positions
- **Rotation Animation**: Smooth rotation to target orientations
- **Scale Animation**: Smooth scaling to target sizes
- **Speed Control**: Configurable animation speeds for each transformation type

### 4. 3D Coordinate System

- **Right-handed Coordinate System**: Uses standard 3D coordinate conventions
- **Euler Angles**: Rotation using pitch (X), yaw (Y), roll (Z) in radians
- **Camera Space**: Movement calculations in camera-relative space

## Usage

### Basic Setup

```typescript
// Add the system to your world
world.addSystem(new Transform3DSystem());
```

### Creating a 3D Camera Entity

```typescript
const camera = world.createEntity('camera');

// Add required components
camera.addComponent(
  world.createComponent(Camera3DComponent, {
    fov: 75,
    aspectRatio: 16 / 9,
    projectionMode: 'perspective',
  }),
);

camera.addComponent(
  world.createComponent(Transform3DComponent, {
    position: [0, 5, 10],
  }),
);

camera.addComponent(new ActiveCameraTag());

camera.addComponent(
  world.createComponent(Input3DComponent, {
    mouseSensitivity: 0.1,
    moveSpeed: 5,
    sprintSpeed: 10,
  }),
);

world.addEntity(camera);
```

### Creating a 3D Movable Entity

```typescript
const player = world.createEntity('player');

player.addComponent(
  world.createComponent(Transform3DComponent, {
    position: [0, 0, 0],
  }),
);

player.addComponent(
  world.createComponent(Input3DComponent, {
    moveSpeed: 5,
    sprintSpeed: 10,
  }),
);

// Optional: Add physics component for velocity-based movement (now supports 3D)
player.addComponent(
  world.createComponent(PhysicsComponent, {
    speed: 5,
  }),
);

world.addEntity(player);
```

### Transform Animations

```typescript
const transformSystem = world.getSystem<Transform3DSystem>('Transform3DSystem');

// Animate position
transformSystem.setPositionTarget('entity-id', [10, 5, 0], 2.0); // 2 units per second

// Animate rotation
transformSystem.setRotationTarget('entity-id', [0, Math.PI, 0], 1.0); // 1 radian per second

// Animate scale
transformSystem.setScaleTarget('entity-id', [2, 2, 2], 0.5); // 0.5 scale units per second
```

## Input Controls

### Movement Controls

- **W**: Move forward
- **S**: Move backward
- **A**: Move left
- **D**: Move right
- **Space**: Move up
- **C**: Move down
- **Shift**: Sprint (2x speed multiplier)

### Camera Controls

- **Mouse Movement**: Look around (yaw and pitch)
- **Mouse Sensitivity**: Configurable in `Input3DComponent`

## System Integration

### Required Components

- `Transform3DComponent`: For position, rotation, and scale
- `Input3DComponent`: For input handling
- `Camera3DComponent`: For camera entities
- `ActiveCameraTag`: To mark the active camera

### Optional Components

- `PhysicsComponent`: For velocity-based movement (now supports 3D velocity)
- `StatsComponent`: For movement speed multipliers

### System Priority

- **Priority**: `SystemPriorities.TRANSFORM`
- **Category**: `'render'`
- **Order**: Should run after input systems, before rendering systems

## API Reference

### Public Methods

#### `setPositionTarget(entityId: string, targetPosition: Vec3, positionSpeed: number): void`

Sets a position animation target for an entity.

#### `setRotationTarget(entityId: string, targetRotation: Vec3, rotationSpeed: number): void`

Sets a rotation animation target for an entity.

#### `setScaleTarget(entityId: string, targetScale: Vec3, scaleSpeed: number): void`

Sets a scale animation target for an entity.

#### `getCameraRotation(): { yaw: number; pitch: number; roll: number }`

Gets the current camera rotation values.

#### `setCameraRotation(yaw: number, pitch: number, roll: number = 0): void`

Sets the camera rotation values.

## Technical Details

### Coordinate System

- **X-axis**: Right (positive) / Left (negative)
- **Y-axis**: Up (positive) / Down (negative)
- **Z-axis**: Forward (negative) / Backward (positive)

### Rotation Order

1. **Pitch**: Rotation around X-axis (up/down)
2. **Yaw**: Rotation around Y-axis (left/right)
3. **Roll**: Rotation around Z-axis (tilt)

### Performance Considerations

- Transform animations are automatically cleaned up when targets are reached
- Camera rotation is only calculated for entities with camera components
- Movement calculations use efficient vector operations
- Small velocity threshold prevents unnecessary physics updates

## Differences from TransformSystem

| Feature     | TransformSystem (2D) | Transform3DSystem (3D)            |
| ----------- | -------------------- | --------------------------------- |
| Coordinates | 2D (x, y)            | 3D (x, y, z)                      |
| Rotation    | Single angle         | Euler angles (pitch, yaw, roll)   |
| Movement    | 2D plane             | 3D space with camera-relative     |
| Camera      | 2D camera            | 3D camera with mouse look         |
| Input       | Arrow keys/WASD      | WASD + Space/C + Mouse            |
| Physics     | 2D velocity          | 3D velocity (backward compatible) |
