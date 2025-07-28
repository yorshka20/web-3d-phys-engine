# Scene Management Specification

## Overview
Hierarchical scene organization system for 3D objects with spatial acceleration and component-based architecture.

## Core Interfaces

### Scene Graph
```typescript
interface SceneNode {
    // Hierarchy
    parent: SceneNode | null;
    children: SceneNode[];
    
    // Transform
    localTransform: Transform;
    worldTransform: Matrix4; // computed on demand
    
    // Components & metadata
    components: Map<string, Component>;
    name: string;
    visible: boolean;
    active: boolean;
    tags: Set<string>;
}

interface Transform {
    position: Vector3;
    rotation: Quaternion; 
    scale: Vector3;
    
    getMatrix(): Matrix4;
    markDirty(): void;
}
```

### Component System
```typescript
interface Component {
    node: SceneNode | null;
    enabled: boolean;
    
    onAttached(): void;
    onDetached(): void;
    update(deltaTime: number): void;
}

// Key component types
interface MeshRenderer extends Component {
    mesh: Mesh;
    material: Material;
    render(renderer: WebGPURenderer): void;
}

interface RigidBodyComponent extends Component {
    rigidBody: RigidBody;
    syncTransform(): void; // physics → scene node
}

interface CameraComponent extends Component {
    camera: Camera;
}
```

## Spatial Acceleration

### Octree Implementation
```typescript
interface Octree {
    bounds: AABB;
    maxDepth: number;
    maxObjects: number;
    
    insert(object: SceneNode): void;
    remove(object: SceneNode): void;
    query(frustum: Frustum): SceneNode[];
    queryRadius(center: Vector3, radius: number): SceneNode[];
}
```

**Design Notes:**
- Loose octree with 2x cell expansion for dynamic objects
- Rebuild strategy: incremental updates vs full rebuild based on movement threshold
- Separate trees for static/dynamic objects

### Frustum Culling
```typescript
interface FrustumCuller {
    cull(camera: Camera, nodes: SceneNode[]): SceneNode[];
    testAABB(aabb: AABB, frustum: Frustum): CullResult;
}

enum CullResult {
    OUTSIDE,
    INTERSECTING, 
    INSIDE
}
```

## Scene Management

### Main Scene Class
```typescript
interface Scene {
    root: SceneNode;
    physicsWorld: PhysicsWorld;
    spatialAcceleration: Octree;
    
    // Object management
    addObject(node: SceneNode): void;
    removeObject(node: SceneNode): void;
    findByName(name: string): SceneNode | null;
    findByTag(tag: string): SceneNode[];
    
    // Update cycle
    update(deltaTime: number): void;
    render(renderer: WebGPURenderer, camera: Camera): void;
    
    // Queries
    raycast(ray: Ray): RaycastResult[];
    getVisibleObjects(camera: Camera): SceneNode[];
}
```

### Level-of-Detail (LOD)
```typescript
interface LODComponent extends Component {
    lodLevels: Mesh[];
    distances: number[];
    
    selectLOD(cameraDistance: number): Mesh;
}
```

## Performance Considerations

### Transform Updates
- Lazy evaluation: compute world transforms only when needed
- Dirty flagging: propagate changes down hierarchy
- Batch updates: process all transform updates together

### Rendering Optimization
- **Instancing**: Group identical objects for GPU instancing
- **Batching**: Combine objects with same material/shader
- **Sorting**: Depth sorting for transparency, state sorting for efficiency

### Memory Management  
- Object pooling for temporary scene queries
- Spatial structure rebalancing based on usage patterns
- Component hot-swapping without scene graph changes

## Integration Points

### Physics Synchronization
```typescript
interface PhysicsSync {
    syncPhysicsToScene(): void; // after physics step
    syncSceneToPhysics(): void; // for kinematic objects
}
```

### Renderer Interface
```typescript
interface RenderQueue {
    opaque: MeshRenderer[];
    transparent: MeshRenderer[];
    shadow: MeshRenderer[];
    
    sort(): void;
    clear(): void;
}
```

## Implementation Priority
1. **Basic scene graph** - hierarchy and transforms
2. **Component system** - attach/detach, lifecycle
3. **Spatial acceleration** - octree for culling
4. **Render integration** - visible object collection
5. **Physics integration** - transform synchronization
6. **Performance features** - LOD, instancing, batching