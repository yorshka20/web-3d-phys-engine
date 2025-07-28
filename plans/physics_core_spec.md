# Physics Core Specification

## Overview
High-performance rigid body physics engine with GPU acceleration, designed for real-time simulation of complex 3D scenes with thousands of interacting objects.

## Core Architecture

### Physics World
```typescript
interface PhysicsWorld {
    // Simulation properties
    gravity: Vector3;
    timeStep: number;
    maxSubSteps: number;
    damping: number;
    
    // Object management
    rigidBodies: RigidBody[];
    constraints: Constraint[];
    collisionPairs: CollisionPair[];
    
    // Spatial organization
    broadPhase: BroadPhaseCollision;
    narrowPhase: NarrowPhaseCollision;
    
    // Simulation control
    step(deltaTime: number): void;
    addRigidBody(body: RigidBody): void;
    removeRigidBody(body: RigidBody): void;
}
```

### Implementation Structure
```typescript
class PhysicsWorld {
    private computeDevice: WebGPUPhysicsCompute;
    private integrator: PhysicsIntegrator;
    private collisionDetector: CollisionSystem;
    private constraintSolver: ConstraintSolver;
    
    // Main simulation loop
    step(deltaTime: number): void {
        const subStepTime = Math.min(deltaTime, this.timeStep);
        const subSteps = Math.ceil(deltaTime / this.timeStep);
        
        for (let i = 0; i < Math.min(subSteps, this.maxSubSteps); i++) {
            this.integrateForces(subStepTime);
            this.detectCollisions();
            this.solveConstraints(subStepTime);
            this.integrateVelocities(subStepTime);
        }
    }
}
```

## Rigid Body System

### Rigid Body Structure
```typescript
interface RigidBodyData {
    // Transform state
    position: Vector3;
    orientation: Quaternion;
    
    // Motion state  
    linearVelocity: Vector3;
    angularVelocity: Vector3;
    
    // Forces and torques
    force: Vector3;
    torque: Vector3;
    
    // Physical properties
    mass: number;
    invMass: number; // 1/mass, 0 for static objects
    inertiaTensor: Matrix3;
    invInertiaTensor: Matrix3;
    
    // Material properties
    restitution: number; // bounciness [0,1]
    friction: number;    // surface friction
    drag: number;        // air resistance
    
    // State flags
    isStatic: boolean;
    isSleeping: boolean;
    isEnabled: boolean;
    
    // Collision shape reference
    collisionShape: CollisionShape;
    
    // User data
    userData?: any;
}
```

### Rigid Body Class
```typescript
class RigidBody {
    public data: RigidBodyData;
    private world: PhysicsWorld | null = null;
    
    constructor(shape: CollisionShape, mass: number = 1.0) {
        this.data = this.initializeData(shape, mass);
    }
    
    // Physics state updates
    applyForce(force: Vector3, worldPoint?: Vector3): void;
    applyImpulse(impulse: Vector3, worldPoint?: Vector3): void;
    applyTorque(torque: Vector3): void;
    
    // Transform operations
    setPosition(position: Vector3): void;
    setRotation(rotation: Quaternion): void;
    getTransformMatrix(): Matrix4;
    
    // Physics properties
    setMass(mass: number): void;
    setRestitution(restitution: number): void;
    setFriction(friction: number): void;
    
    // State management
    sleep(): void;
    wakeUp(): void;
    isAwake(): boolean;
    
    // Collision shape management
    setCollisionShape(shape: CollisionShape): void;
    getAABB(): AABB;
}
```

## Collision System

### Collision Shapes
```typescript
abstract class CollisionShape {
    type: CollisionShapeType;
    localBounds: AABB;
    
    abstract computeAABB(transform: Matrix4): AABB;
    abstract computeInertia(mass: number): Matrix3;
    abstract getSupport(direction: Vector3): Vector3; // For GJK
}

enum CollisionShapeType {
    BOX = 'box',
    SPHERE = 'sphere', 
    CAPSULE = 'capsule',
    CYLINDER = 'cylinder',
    CONVEX_HULL = 'convex_hull',
    TRIANGLE_MESH = 'triangle_mesh'
}

// Primitive shapes
class BoxShape extends CollisionShape {
    halfExtents: Vector3;
    
    computeAABB(transform: Matrix4): AABB;
    computeInertia(mass: number): Matrix3;
    getSupport(direction: Vector3): Vector3;
}

class SphereShape extends CollisionShape {
    radius: number;
    
    computeAABB(transform: Matrix4): AABB;
    computeInertia(mass: number): Matrix3;
    getSupport(direction: Vector3): Vector3;
}
```

### Broad Phase Collision Detection
```typescript
interface BroadPhaseCollision {
    update(bodies: RigidBody[]): CollisionPair[];
    addBody(body: RigidBody): void;
    removeBody(body: RigidBody): void;
    query(aabb: AABB): RigidBody[];
}

// Spatial hash grid implementation
class SpatialHashGrid implements BroadPhaseCollision {
    private cellSize: number;
    private grid: Map<string, Set<RigidBody>>;
    
    update(bodies: RigidBody[]): CollisionPair[] {
        this.grid.clear();
        
        // Insert all bodies into grid
        for (const body of bodies) {
            const aabb = body.getAABB();
            const cells = this.getCells(aabb);
            for (const cell of cells) {
                this.getOrCreateCell(cell).add(body);
            }
        }
        
        // Find potential collision pairs
        return this.generatePairs();
    }
    
    private getCells(aabb: AABB): string[] {
        const cells: string[] = [];
        const minCell = this.worldToCell(aabb.min);
        const maxCell = this.worldToCell(aabb.max);
        
        for (let x = minCell.x; x <= maxCell.x; x++) {
            for (let y = minCell.y; y <= maxCell.y; y++) {
                for (let z = minCell.z; z <= maxCell.z; z++) {
                    cells.push(`${x},${y},${z}`);
                }
            }
        }
        return cells;
    }
}
```

### Narrow Phase Collision Detection
```typescript
interface CollisionPair {
    bodyA: RigidBody;
    bodyB: RigidBody;
    contacts: ContactPoint[];
    penetrationDepth: number;
    collisionNormal: Vector3;
}

interface ContactPoint {
    pointA: Vector3;    // Contact point on body A
    pointB: Vector3;    // Contact point on body B
    normal: Vector3;    // Contact normal (from A to B)
    depth: number;      // Penetration depth
    impulse: number;    // Accumulated impulse
}

class NarrowPhaseCollision {
    // Main collision detection dispatch
    detectCollision(bodyA: RigidBody, bodyB: RigidBody): CollisionPair | null {
        const shapeA = bodyA.data.collisionShape;
        const shapeB = bodyB.data.collisionShape;
        
        // Dispatch to appropriate algorithm
        if (shapeA.type === CollisionShapeType.SPHERE && shapeB.type === CollisionShapeType.SPHERE) {
            return this.sphereVsSphere(bodyA, bodyB);
        } else if (shapeA.type === CollisionShapeType.BOX && shapeB.type === CollisionShapeType.BOX) {
            return this.boxVsBox(bodyA, bodyB);
        } else {
            // Use GJK/EPA for general convex shapes
            return this.gjkEpaCollision(bodyA, bodyB);
        }
    }
    
    // Specialized algorithms for common cases
    private sphereVsSphere(bodyA: RigidBody, bodyB: RigidBody): CollisionPair | null;
    private boxVsBox(bodyA: RigidBody, bodyB: RigidBody): CollisionPair | null;
    
    // General convex collision using GJK/EPA
    private gjkEpaCollision(bodyA: RigidBody, bodyB: RigidBody): CollisionPair | null;
}
```

## Physics Integration

### Integration Methods
```typescript
interface PhysicsIntegrator {
    integrateForces(bodies: RigidBody[], deltaTime: number): void;
    integrateVelocities(bodies: RigidBody[], deltaTime: number): void;
}

class SemiImplicitEulerIntegrator implements PhysicsIntegrator {
    integrateForces(bodies: RigidBody[], deltaTime: number): void {
        for (const body of bodies) {
            if (body.data.isStatic || body.data.isSleeping) continue;
            
            const data = body.data;
            
            // Linear integration: v += a * dt
            const acceleration = data.force.multiply(data.invMass);
            data.linearVelocity.addInPlace(acceleration.multiply(deltaTime));
            
            // Angular integration: ω += I⁻¹ * τ * dt
            const angularAcceleration = data.invInertiaTensor.transformVector(data.torque);
            data.angularVelocity.addInPlace(angularAcceleration.multiply(deltaTime));
            
            // Apply damping
            data.linearVelocity.multiplyInPlace(Math.pow(1.0 - data.drag, deltaTime));
            data.angularVelocity.multiplyInPlace(Math.pow(1.0 - data.drag, deltaTime));
            
            // Clear forces for next frame
            data.force.set(0, 0, 0);
            data.torque.set(0, 0, 0);
        }
    }
    
    integrateVelocities(bodies: RigidBody[], deltaTime: number): void {
        for (const body of bodies) {
            if (body.data.isStatic || body.data.isSleeping) continue;
            
            const data = body.data;
            
            // Position integration: x += v * dt
            data.position.addInPlace(data.linearVelocity.multiply(deltaTime));
            
            // Orientation integration: q += 0.5 * ω * q * dt
            const angularDisplacement = data.angularVelocity.multiply(deltaTime * 0.5);
            const deltaRotation = new Quaternion(
                angularDisplacement.x,
                angularDisplacement.y, 
                angularDisplacement.z,
                0
            );
            
            const orientationChange = deltaRotation.multiply(data.orientation);
            data.orientation.addInPlace(orientationChange);
            data.orientation.normalizeInPlace();
        }
    }
}
```

## Constraint System

### Base Constraint Interface
```typescript
abstract class Constraint {
    bodyA: RigidBody;
    bodyB: RigidBody | null; // null for world constraints
    enabled: boolean = true;
    
    constructor(bodyA: RigidBody, bodyB?: RigidBody) {
        this.bodyA = bodyA;
        this.bodyB = bodyB || null;
    }
    
    // Constraint solving
    abstract prepareConstraint(deltaTime: number): void;
    abstract solveConstraint(): void;
    abstract getConstraintImpulse(): number;
}

// Distance constraint (maintains fixed distance between two points)
class DistanceConstraint extends Constraint {
    anchorA: Vector3;  // Local anchor point on body A
    anchorB: Vector3;  // Local anchor point on body B
    restLength: number;
    stiffness: number = 1.0;
    damping: number = 0.1;
    
    private jacobian: Vector3[] = [];
    private bias: number = 0;
    private effectiveMass: number = 0;
    private accumulatedImpulse: number = 0;
    
    prepareConstraint(deltaTime: number): void {
        // Compute world anchor points
        const worldAnchorA = this.bodyA.getTransformMatrix().transformPoint(this.anchorA);
        const worldAnchorB = this.bodyB ? 
            this.bodyB.getTransformMatrix().transformPoint(this.anchorB) : 
            this.anchorB;
        
        // Constraint vector and current distance
        const constraintVector = worldAnchorB.subtract(worldAnchorA);
        const currentDistance = constraintVector.length();
        
        if (currentDistance < MathUtils.EPSILON) return;
        
        // Constraint normal (unit vector)
        const normal = constraintVector.normalize();
        
        // Compute Jacobian
        this.jacobian[0] = normal.negate(); // Linear jacobian for body A
        this.jacobian[1] = worldAnchorA.subtract(this.bodyA.data.position).cross(normal).negate(); // Angular jacobian for body A
        
        if (this.bodyB) {
            this.jacobian[2] = normal; // Linear jacobian for body B
            this.jacobian[3] = worldAnchorB.subtract(this.bodyB.data.position).cross(normal); // Angular jacobian for body B
        }
        
        // Compute effective mass (1 / (J * M⁻¹ * Jᵀ))
        let effectiveMass = this.bodyA.data.invMass;
        effectiveMass += this.jacobian[1].dot(this.bodyA.data.invInertiaTensor.transformVector(this.jacobian[1]));
        
        if (this.bodyB) {
            effectiveMass += this.bodyB.data.invMass;
            effectiveMass += this.jacobian[3].dot(this.bodyB.data.invInertiaTensor.transformVector(this.jacobian[3]));
        }
        
        this.effectiveMass = effectiveMass > 0 ? 1.0 / effectiveMass : 0;
        
        // Compute bias (position correction)
        const positionError = currentDistance - this.restLength;
        this.bias = -(this.stiffness / deltaTime) * positionError;
        
        // Warm starting
        this.applyImpulse(this.accumulatedImpulse);
    }
    
    solveConstraint(): void {
        // Compute constraint velocity
        let constraintVelocity = 0;
        constraintVelocity += this.jacobian[0].dot(this.bodyA.data.linearVelocity);
        constraintVelocity += this.jacobian[1].dot(this.bodyA.data.angularVelocity);
        
        if (this.bodyB) {
            constraintVelocity += this.jacobian[2].dot(this.bodyB.data.linearVelocity);
            constraintVelocity += this.jacobian[3].dot(this.bodyB.data.angularVelocity);
        }
        
        // Compute impulse
        const lambda = this.effectiveMass * (-(constraintVelocity + this.bias) - this.damping * this.accumulatedImpulse);
        
        this.applyImpulse(lambda);
        this.accumulatedImpulse += lambda;
    }
    
    private applyImpulse(impulse: number): void {
        // Apply impulse to body A
        this.bodyA.data.linearVelocity.addInPlace(this.jacobian[0].multiply(impulse * this.bodyA.data.invMass));
        this.bodyA.data.angularVelocity.addInPlace(
            this.bodyA.data.invInertiaTensor.transformVector(this.jacobian[1].multiply(impulse))
        );
        
        // Apply impulse to body B
        if (this.bodyB) {
            this.bodyB.data.linearVelocity.addInPlace(this.jacobian[2].multiply(impulse * this.bodyB.data.invMass));
            this.bodyB.data.angularVelocity.addInPlace(
                this.bodyB.data.invInertiaTensor.transformVector(this.jacobian[3].multiply(impulse))
            );
        }
    }
    
    getConstraintImpulse(): number {
        return this.accumulatedImpulse;
    }
}
```

### Constraint Solver
```typescript
class SequentialImpulseSolver {
    private constraints: Constraint[] = [];
    private iterations: number = 10;
    
    addConstraint(constraint: Constraint): void {
        this.constraints.push(constraint);
    }
    
    removeConstraint(constraint: Constraint): void {
        const index = this.constraints.indexOf(constraint);
        if (index >= 0) {
            this.constraints.splice(index, 1);
        }
    }
    
    solve(deltaTime: number): void {
        // Prepare all constraints
        for (const constraint of this.constraints) {
            if (constraint.enabled) {
                constraint.prepareConstraint(deltaTime);
            }
        }
        
        // Iteratively solve constraints
        for (let iteration = 0; iteration < this.iterations; iteration++) {
            for (const constraint of this.constraints) {
                if (constraint.enabled) {
                    constraint.solveConstraint();
                }
            }
        }
    }
    
    setiterations(iterations: number): void {
        this.iterations = Math.max(1, iterations);
    }
}
```

## GPU Acceleration Interface

### WebGPU Physics Compute
```typescript
class WebGPUPhysicsCompute {
    private device: GPUDevice;
    private bodyBuffer: GPUBuffer;
    private integrationPipeline: GPUComputePipeline;
    private collisionPipeline: GPUComputePipeline;
    
    constructor(device: GPUDevice) {
        this.device = device;
        this.setupComputePipelines();
    }
    
    // Update physics on GPU
    async computePhysics(bodies: RigidBody[], deltaTime: number): Promise<void> {
        // Upload body data to GPU
        await this.uploadBodies(bodies);
        
        const encoder = this.device.createCommandEncoder();
        
        // Integration pass
        const integrationPass = encoder.beginComputePass();
        integrationPass.setPipeline(this.integrationPipeline);
        integrationPass.setBindGroup(0, this.createBindGroup());
        integrationPass.dispatchWorkgroups(Math.ceil(bodies.length / 64));
        integrationPass.end();
        
        // Collision detection pass
        const collisionPass = encoder.beginComputePass();
        collisionPass.setPipeline(this.collisionPipeline);
        collisionPass.setBindGroup(0, this.createBindGroup());
        collisionPass.dispatchWorkgroups(Math.ceil(bodies.length / 8), Math.ceil(bodies.length / 8));
        collisionPass.end();
        
        this.device.queue.submit([encoder.finish()]);
        
        // Read back results
        await this.downloadBodies(bodies);
    }
    
    private async uploadBodies(bodies: RigidBody[]): Promise<void>;
    private async downloadBodies(bodies: RigidBody[]): Promise<void>;
    private setupComputePipelines(): void;
    private createBindGroup(): GPUBindGroup;
}
```

## Performance and Memory Management

### Object Pooling
```typescript
class PhysicsObjectPool {
    private rigidBodyPool: RigidBody[] = [];
    private contactPointPool: ContactPoint[] = [];
    private collisionPairPool: CollisionPair[] = [];
    
    acquireRigidBody(): RigidBody {
        return this.rigidBodyPool.pop() || new RigidBody(new SphereShape(1));
    }
    
    releaseRigidBody(body: RigidBody): void {
        body.reset();
        this.rigidBodyPool.push(body);
    }
    
    acquireContactPoint(): ContactPoint;
    releaseContactPoint(contact: ContactPoint): void;
    
    acquireCollisionPair(): CollisionPair;
    releaseCollisionPair(pair: CollisionPair): void;
}
```

### Sleeping System
```typescript
class SleepingSystem {
    private sleepEpsilon: number = 0.01;
    private sleepTime: number = 1.0; // seconds
    
    updateSleeping(bodies: RigidBody[], deltaTime: number): void {
        for (const body of bodies) {
            if (body.data.isStatic) continue;
            
            const velocity = body.data.linearVelocity.length();
            const angularVelocity = body.data.angularVelocity.length();
            
            if (velocity < this.sleepEpsilon && angularVelocity < this.sleepEpsilon) {
                body.data.sleepTimer += deltaTime;
                if (body.data.sleepTimer > this.sleepTime) {
                    body.sleep();
                }
            } else {
                body.data.sleepTimer = 0;
                if (body.data.isSleeping) {
                    body.wakeUp();
                }
            }
        }
    }
}
```

## Implementation Guidelines

### Performance Priorities
1. **Broad phase optimization** - Efficient spatial partitioning
2. **Memory layout** - Cache-friendly data structures
3. **SIMD utilization** - Vectorized math operations
4. **GPU offloading** - Parallel physics computation
5. **Sleeping objects** - Skip inactive bodies

### Error Handling and Validation
```typescript
class PhysicsValidator {
    static validateRigidBody(body: RigidBody): boolean {
        const data = body.data;
        
        // Check for NaN values
        if (!this.isValidVector(data.position) || !this.isValidVector(data.linearVelocity)) {
            console.error('Invalid physics state detected');
            return false;
        }
        
        // Check mass constraints
        if (data.mass <= 0 && !data.isStatic) {
            console.error('Non-static body must have positive mass');
            return false;
        }
        
        return true;
    }
    
    private static isValidVector(v: Vector3): boolean {
        return isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
    }
}
```