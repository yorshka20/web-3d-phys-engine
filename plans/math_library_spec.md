# Math Library Specification

## Overview
Core mathematical operations for 3D graphics and physics simulation. All classes designed for performance with minimal memory allocation and GPU-friendly data layout.

## Memory Layout Requirements
- All vectors/matrices use Float32Array for WebGPU compatibility
- 16-byte alignment for uniform buffers
- Consistent row-major matrix ordering
- In-place operations where possible to reduce GC pressure

## Vector3 Class

### Properties
```typescript
class Vector3 {
    public data: Float32Array; // [x, y, z, w] - w for alignment padding
    
    get x(): number;
    get y(): number; 
    get z(): number;
    set x(value: number);
    set y(value: number);
    set z(value: number);
}
```

### Essential Methods
```typescript
// Construction
constructor(x?: number, y?: number, z?: number)
static zero(): Vector3
static one(): Vector3
static forward(): Vector3  // (0, 0, 1)
static up(): Vector3       // (0, 1, 0)
static right(): Vector3    // (1, 0, 0)

// Basic operations (return new Vector3)
add(other: Vector3): Vector3
subtract(other: Vector3): Vector3
multiply(scalar: number): Vector3
divide(scalar: number): Vector3

// In-place operations (modify this instance)
addInPlace(other: Vector3): Vector3
subtractInPlace(other: Vector3): Vector3
multiplyInPlace(scalar: number): Vector3
normalizeInPlace(): Vector3

// Calculations
dot(other: Vector3): number
cross(other: Vector3): Vector3
length(): number
lengthSquared(): number
distance(other: Vector3): number
normalize(): Vector3

// Utility
copy(other: Vector3): Vector3
clone(): Vector3
equals(other: Vector3, epsilon?: number): boolean
toString(): string
```

### Usage Patterns
```typescript
// Preferred: minimize allocations
const velocity = new Vector3();
velocity.copy(force).multiplyInPlace(deltaTime).addInPlace(currentVelocity);

// Avoid: creates temporary objects
const velocity = force.multiply(deltaTime).add(currentVelocity);
```

## Matrix4 Class

### Properties
```typescript
class Matrix4 {
    public data: Float32Array; // 16 elements, row-major order
    
    // Element access
    get(row: number, col: number): number;
    set(row: number, col: number, value: number): void;
}
```

### Essential Methods
```typescript
// Construction
constructor(elements?: number[])
static identity(): Matrix4
static zero(): Matrix4

// Transformations
static translation(x: number, y: number, z: number): Matrix4
static rotation(axis: Vector3, angle: number): Matrix4
static rotationFromQuaternion(quaternion: Quaternion): Matrix4
static scale(x: number, y: number, z: number): Matrix4

// View/Projection matrices
static lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4
static perspective(fov: number, aspect: number, near: number, far: number): Matrix4
static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4

// Operations
multiply(other: Matrix4): Matrix4
multiplyInPlace(other: Matrix4): Matrix4
transpose(): Matrix4
transposeInPlace(): Matrix4
invert(): Matrix4
invertInPlace(): Matrix4

// Vector transformations
transformVector3(vector: Vector3): Vector3
transformDirection(vector: Vector3): Vector3 // w=0
transformPoint(vector: Vector3): Vector3     // w=1

// Utility
copy(other: Matrix4): Matrix4
clone(): Matrix4
equals(other: Matrix4, epsilon?: number): boolean
```

## Quaternion Class

### Properties
```typescript
class Quaternion {
    public data: Float32Array; // [x, y, z, w]
    
    get x(): number;
    get y(): number;
    get z(): number;
    get w(): number;
    set x(value: number);
    set y(value: number);
    set z(value: number);
    set w(value: number);
}
```

### Essential Methods
```typescript
// Construction
constructor(x?: number, y?: number, z?: number, w?: number)
static identity(): Quaternion
static fromAxisAngle(axis: Vector3, angle: number): Quaternion
static fromEulerAngles(x: number, y: number, z: number): Quaternion
static lookRotation(forward: Vector3, up?: Vector3): Quaternion

// Operations
multiply(other: Quaternion): Quaternion
multiplyInPlace(other: Quaternion): Quaternion
conjugate(): Quaternion
conjugateInPlace(): Quaternion
normalize(): Quaternion
normalizeInPlace(): Quaternion

// Conversions
toMatrix4(): Matrix4
toEulerAngles(): Vector3
toAxisAngle(): { axis: Vector3, angle: number }

// Interpolation
slerp(other: Quaternion, t: number): Quaternion
slerpInPlace(other: Quaternion, t: number): Quaternion

// Vector rotation
rotateVector(vector: Vector3): Vector3

// Utility
dot(other: Quaternion): number
length(): number
lengthSquared(): number
equals(other: Quaternion, epsilon?: number): boolean
```

## MathUtils Static Class

### Constants
```typescript
class MathUtils {
    static readonly PI: number;
    static readonly TWO_PI: number;
    static readonly HALF_PI: number;
    static readonly DEG_TO_RAD: number;
    static readonly RAD_TO_DEG: number;
    static readonly EPSILON: number; // 1e-6
}
```

### Utility Functions
```typescript
// Basic math
static clamp(value: number, min: number, max: number): number
static lerp(a: number, b: number, t: number): number
static smoothstep(edge0: number, edge1: number, x: number): number
static isPowerOfTwo(value: number): boolean
static nextPowerOfTwo(value: number): number

// Angle utilities
static degToRad(degrees: number): number
static radToDeg(radians: number): number
static normalizeAngle(angle: number): number // [-PI, PI]

// Float comparisons
static equals(a: number, b: number, epsilon?: number): boolean
static isZero(value: number, epsilon?: number): boolean

// Random utilities (for testing/particles)
static randomRange(min: number, max: number): number
static randomVector3(minLength: number, maxLength: number): Vector3
```

## Performance Considerations

### Object Pooling Integration
```typescript
// All math classes should support pooling
interface Poolable {
    reset(): void;
}

class Vector3 implements Poolable {
    reset(): void {
        this.x = 0;
        this.y = 0; 
        this.z = 0;
    }
}
```

### GPU Buffer Layout
```typescript
// Helper for WebGPU buffer creation
class MathUtils {
    static createAlignedBuffer(vectors: Vector3[]): Float32Array {
        const buffer = new Float32Array(vectors.length * 4); // 16-byte aligned
        for (let i = 0; i < vectors.length; i++) {
            const offset = i * 4;
            buffer[offset] = vectors[i].x;
            buffer[offset + 1] = vectors[i].y;
            buffer[offset + 2] = vectors[i].z;
            buffer[offset + 3] = 0; // padding
        }
        return buffer;
    }
}
```

## Testing Requirements
- Unit tests for all mathematical operations
- Precision tests with known results
- Performance benchmarks for critical operations
- Cross-validation with reference implementations

## Implementation Notes
- Use SIMD-friendly algorithms where possible
- Implement both safe (checking) and unsafe (fast) versions of operations
- Consider using lookup tables for trigonometric functions if needed
- Profile and optimize the most frequently used operations first