# Utils and Development Tools Specification

## Object Pool System

### Generic Object Pool
```typescript
interface ObjectPool<T> {
    acquire(): T;
    release(obj: T): void;
    size: number;
    activeCount: number;
    
    preAllocate(count: number): void;
    clear(): void;
}

interface Poolable {
    reset(): void; // prepare for reuse
}
```

**Key Pools Needed:**
- Vector3/Matrix4/Quaternion pools for math operations
- RigidBody pool for physics simulation
- ContactPoint pool for collision detection
- Render command pools for GPU submission

### Memory Management
```typescript
interface MemoryTracker {
    trackAllocation(size: number, category: string): void;
    trackDeallocation(size: number, category: string): void;
    getStats(): MemoryStats;
}

interface MemoryStats {
    totalAllocated: number;
    byCategory: Map<string, number>;
    peakUsage: number;
    gcPressure: number;
}
```

## Debug and Profiling

### Performance Profiler
```typescript
interface Profiler {
    beginSample(name: string): void;
    endSample(name: string): void;
    getFrameStats(): FrameStats;
    
    // GPU timing
    beginGPUTime(label: string): void;
    endGPUTime(label: string): void;
}

interface FrameStats {
    frameTime: number;
    updateTime: number;
    renderTime: number;
    physicsTime: number;
    
    drawCalls: number;
    triangles: number;
    memoryUsage: number;
}
```

### Debug Renderer
```typescript
interface DebugRenderer {
    // Immediate mode drawing
    drawLine(start: Vector3, end: Vector3, color: Vector3): void;
    drawWireBox(center: Vector3, size: Vector3): void;
    drawWireSphere(center: Vector3, radius: number): void;
    drawText(text: string, position: Vector3): void;
    
    // Physics debug
    drawCollisionShapes(bodies: RigidBody[]): void;
    drawVelocityVectors(bodies: RigidBody[]): void;
    drawContactPoints(contacts: ContactPoint[]): void;
    
    // Spatial structures
    drawOctree(octree: Octree): void;
    drawFrustum(camera: Camera): void;
}
```

### Error Handling
```typescript
interface ErrorHandler {
    handleWebGPUError(error: GPUError): void;
    handlePhysicsError(error: PhysicsError): void;
    validateState(): ValidationResult;
    
    logError(message: string, category: string): void;
    getErrorLog(): ErrorEntry[];
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
```

## Configuration and Settings

### Engine Configuration
```typescript
interface EngineConfig {
    // Rendering
    targetFPS: number;
    vsync: boolean;
    msaaLevel: number;
    shadowResolution: number;
    
    // Physics
    physicsTimeStep: number;
    maxSubSteps: number;
    broadPhaseType: 'SpatialHash' | 'Octree';
    
    // Performance
    enableObjectPooling: boolean;
    enableGPUProfiling: boolean;
    maxRigidBodies: number;
    
    // Debug
    enableDebugDraw: boolean;
    enableValidation: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
}
```

### Development Mode Features
```typescript
interface DevTools {
    // Hot reload
    enableShaderHotReload(): void;
    reloadShader(id: string, source: string): void;
    
    // Runtime tweaking
    tweakValue(name: string, value: number): void;
    watchValue(name: string, callback: (value: number) => void): void;
    
    // Scene inspection
    inspectNode(node: SceneNode): NodeInfo;
    highlightNode(node: SceneNode): void;
    
    // Performance monitoring
    startCapture(): void;
    stopCapture(): PerformanceCapture;
}
```

## Math Utilities

### Extended Math Functions
```typescript
interface MathUtils {
    // Constants
    readonly EPSILON: number;
    readonly PI: number;
    readonly TWO_PI: number;
    readonly HALF_PI: number;
    
    // Interpolation
    lerp(a: number, b: number, t: number): number;
    smoothstep(edge0: number, edge1: number, x: number): number;
    
    // Utility
    clamp(value: number, min: number, max: number): number;
    isPowerOfTwo(value: number): boolean;
    nextPowerOfTwo(value: number): number;
    
    // Random
    randomRange(min: number, max: number): number;
    randomVector3(length?: number): Vector3;
}
```

## Asset Management

### Resource Loading
```typescript
interface AssetLoader {
    loadMesh(url: string): Promise<Mesh>;
    loadTexture(url: string): Promise<GPUTexture>;
    loadShader(url: string): Promise<string>;
    
    // Batch loading
    loadAssets(manifest: AssetManifest): Promise<AssetBundle>;
}

interface AssetManifest {
    meshes: string[];
    textures: string[];
    shaders: string[];
}
```

## Testing Infrastructure

### Unit Testing Helpers
```typescript
interface TestUtils {
    // Math validation
    expectVector3Equal(a: Vector3, b: Vector3, epsilon?: number): void;
    expectMatrix4Equal(a: Matrix4, b: Matrix4, epsilon?: number): void;
    
    // Physics testing
    createTestWorld(): PhysicsWorld;
    createTestBody(shape: CollisionShape): RigidBody;
    stepPhysics(world: PhysicsWorld, steps: number): void;
    
    // Rendering mocks
    createMockRenderer(): WebGPURenderer;
    createMockDevice(): GPUDevice;
}
```

### Performance Benchmarks
```typescript
interface BenchmarkSuite {
    benchmarkMathOperations(): BenchmarkResult;
    benchmarkPhysicsSimulation(bodyCount: number): BenchmarkResult;
    benchmarkRenderingPerformance(objectCount: number): BenchmarkResult;
    
    generateReport(): BenchmarkReport;
}

interface BenchmarkResult {
    name: string;
    averageTime: number;
    minTime: number;
    maxTime: number;
    iterations: number;
}
```

## Implementation Notes

### Performance Priorities
1. **Object pooling** - Minimize GC pressure in tight loops
2. **Profiling hooks** - Measure everything, optimize bottlenecks
3. **Debug modes** - Easy toggle between performance/debug builds
4. **Validation** - Catch errors early in development

### Development Workflow
- **Configuration driven** - Easy to tweak parameters without rebuilds
- **Hot reload** - Shader and asset reloading for rapid iteration
- **Visual debugging** - Immediate visual feedback for physics/rendering
- **Automated testing** - Unit tests for math/physics, integration tests for full pipeline

### Error Recovery
- **Graceful degradation** - Continue operation when non-critical systems fail
- **State validation** - Regular checks for corrupted physics/render state
- **Memory leak detection** - Track object lifetimes and pool usage
- **GPU error handling** - Device lost recovery, validation layer integration