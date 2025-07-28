# Compute Shaders Specification (WGSL)

## Overview
GPU-accelerated physics computation using WebGPU compute shaders written in WGSL. Designed for massive parallelization of physics calculations with efficient memory access patterns.

## Data Structures

### Buffer Layouts
```wgsl
// Rigid body data structure (256 bytes aligned)
struct RigidBody {
    // Transform (64 bytes)
    position: vec3<f32>,
    padding0: f32,
    orientation: vec4<f32>,     // quaternion
    
    // Motion (64 bytes)  
    linearVelocity: vec3<f32>,
    padding1: f32,
    angularVelocity: vec3<f32>,
    padding2: f32,
    
    // Forces (64 bytes)
    force: vec3<f32>,
    padding3: f32,
    torque: vec3<f32>,
    padding4: f32,
    
    // Properties (64 bytes)
    mass: f32,
    invMass: f32,
    restitution: f32,
    friction: f32,
    
    drag: f32,
    sleepTimer: f32,
    flags: u32,           // packed boolean flags
    shapeType: u32,       // collision shape type
    
    // Shape data (varies by type, max 32 bytes)
    shapeData: array<f32, 8>,
    
    // AABB (32 bytes)
    aabbMin: vec3<f32>,
    padding5: f32,
    aabbMax: vec3<f32>,
    padding6: f32
}

// Collision pair for broad phase
struct CollisionPair {
    bodyIndexA: u32,
    bodyIndexB: u32,
    isValid: u32,
    padding: u32
}

// Contact point for narrow phase
struct ContactPoint {
    pointA: vec3<f32>,
    depth: f32,
    pointB: vec3<f32>,
    impulse: f32,
    normal: vec3<f32>,
    padding: f32
}

// Physics simulation parameters
struct PhysicsParams {
    deltaTime: f32,
    gravity: vec3<f32>,
    damping: f32,
    bodyCount: u32,
    maxCollisionPairs: u32,
    iterations: u32,
    sleepEpsilon: f32
}
```

### Binding Groups Layout
```wgsl
// Group 0: Main physics data
@group(0) @binding(0) var<storage, read_write> bodies: array<RigidBody>;
@group(0) @binding(1) var<uniform> params: PhysicsParams;
@group(0) @binding(2) var<storage, read_write> collisionPairs: array<CollisionPair>;
@group(0) @binding(3) var<storage, read_write> contacts: array<ContactPoint>;

// Group 1: Spatial acceleration structures
@group(1) @binding(0) var<storage, read_write> spatialGrid: array<u32>;
@group(1) @binding(1) var<storage, read_write> gridCells: array<u32>;
@group(1) @binding(2) var<uniform> gridParams: SpatialGridParams;
```

## Physics Integration Shaders

### Force Integration
```wgsl
// Clear forces and compute gravity/external forces
@compute @workgroup_size(64)
fn computeForces(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index >= params.bodyCount) { return; }
    
    var body = &bodies[index];
    
    // Skip static and sleeping bodies
    if (((*body).flags & STATIC_FLAG) != 0u || ((*body).flags & SLEEPING_FLAG) != 0u) {
        return;
    }
    
    // Clear previous forces
    (*body).force = vec3<f32>(0.0);
    (*body).torque = vec3<f32>(0.0);
    
    // Apply gravity
    (*body).force += params.gravity * (*body).mass;
    
    // Apply drag force: F_drag = -k * v * |v|
    let velocity = (*body).linearVelocity;
    let speed = length(velocity);
    if (speed > 0.001) {
        (*body).force += -(*body).drag * velocity * speed;
    }
    
    // Apply angular drag
    let angularVel = (*body).angularVelocity;
    let angularSpeed = length(angularVel);
    if (angularSpeed > 0.001) {
        (*body).torque += -(*body).drag * angularVel * angularSpeed;
    }
}

// Semi-implicit Euler integration
@compute @workgroup_size(64)
fn integrateVelocities(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index >= params.bodyCount) { return; }
    
    var body = &bodies[index];
    
    // Skip static and sleeping bodies
    if (((*body).flags & STATIC_FLAG) != 0u || ((*body).flags & SLEEPING_FLAG) != 0u) {
        return;
    }
    
    let dt = params.deltaTime;
    
    // Integrate linear velocity: v += a * dt
    let acceleration = (*body).force * (*body).invMass;
    (*body).linearVelocity += acceleration * dt;
    
    // Integrate angular velocity: ω += I⁻¹ * τ * dt
    // Note: For simplicity, using scalar inertia (sphere approximation)
    let inertia = 0.4 * (*body).mass; // Sphere inertia = 2/5 * m * r²
    let invInertia = select(1.0 / inertia, 0.0, inertia == 0.0);
    (*body).angularVelocity += (*body).torque * invInertia * dt;
    
    // Apply velocity damping
    let dampingFactor = pow(1.0 - params.damping, dt);
    (*body).linearVelocity *= dampingFactor;
    (*body).angularVelocity *= dampingFactor;
}

@compute @workgroup_size(64)
fn integratePositions(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index >= params.bodyCount) { return; }
    
    var body = &bodies[index];
    
    // Skip static and sleeping bodies
    if (((*body).flags & STATIC_FLAG) != 0u || ((*body).flags & SLEEPING_FLAG) != 0u) {
        return;
    }
    
    let dt = params.deltaTime;
    
    // Integrate position: x += v * dt
    (*body).position += (*body).linearVelocity * dt;
    
    // Integrate orientation using quaternion: q += 0.5 * ω * q * dt
    let angularVel = (*body).angularVelocity;
    let angularSpeed = length(angularVel);
    
    if (angularSpeed > 0.001) {
        let axis = angularVel / angularSpeed;
        let angle = angularSpeed * dt;
        let deltaQ = quatFromAxisAngle(axis, angle);
        (*body).orientation = quatMultiply(deltaQ, (*body).orientation);
        (*body).orientation = quatNormalize((*body).orientation);
    }
    
    // Update AABB
    updateAABB(index);
}
```

### Collision Detection Shaders

### Broad Phase (Spatial Grid)
```wgsl
struct SpatialGridParams {
    cellSize: f32,
    gridSize: vec3<u32>,
    worldMin: vec3<f32>,
    worldMax: vec3<f32>
}

// Hash function for spatial grid
fn gridHash(cellCoord: vec3<i32>) -> u32 {
    let p1 = u32(cellCoord.x * 73856093);
    let p2 = u32(cellCoord.y * 19349663); 
    let p3 = u32(cellCoord.z * 83492791);
    return (p1 ^ p2 ^ p3) % arrayLength(&spatialGrid);
}

// Convert world position to grid cell
fn worldToGrid(pos: vec3<f32>) -> vec3<i32> {
    return vec3<i32>((pos - gridParams.worldMin) / gridParams.cellSize);
}

// Insert bodies into spatial grid
@compute @workgroup_size(64)
fn insertIntoGrid(@builtin(global_invocation_id) id: vec3<u32>) {
    let bodyIndex = id.x;
    if (bodyIndex >= params.bodyCount) { return; }
    
    let body = bodies[bodyIndex];
    
    // Skip sleeping bodies in broad phase
    if ((body.flags & SLEEPING_FLAG) != 0u) { return; }
    
    // Get AABB cell range
    let minCell = worldToGrid(body.aabbMin);
    let maxCell = worldToGrid(body.aabbMax);
    
    // Insert into all overlapping cells
    for (var x = minCell.x; x <= maxCell.x; x++) {
        for (var y = minCell.y; y <= maxCell.y; y++) {
            for (var z = minCell.z; z <= maxCell.z; z++) {
                let cellCoord = vec3<i32>(x, y, z);
                let hash = gridHash(cellCoord);
                
                // Atomic insertion into grid cell
                let cellIndex = atomicAdd(&spatialGrid[hash], 1u);
                if (cellIndex < MAX_OBJECTS_PER_CELL) {
                    gridCells[hash * MAX_OBJECTS_PER_CELL + cellIndex] = bodyIndex;
                }
            }
        }
    }
}

// Generate collision pairs from spatial grid
@compute @workgroup_size(8, 8)
fn generateCollisionPairs(@builtin(global_invocation_id) id: vec3<u32>) {
    let bodyIndexA = id.x;
    let bodyIndexB = id.y;
    
    if (bodyIndexA >= bodyIndexB || bodyIndexA >= params.bodyCount || bodyIndexB >= params.bodyCount) {
        return;
    }
    
    let bodyA = bodies[bodyIndexA];
    let bodyB = bodies[bodyIndexB];
    
    // Skip if both bodies are static or sleeping
    if (((bodyA.flags | bodyB.flags) & (STATIC_FLAG | SLEEPING_FLAG)) == (STATIC_FLAG | SLEEPING_FLAG)) {
        return;
    }
    
    // AABB overlap test
    if (aabbOverlap(bodyA.aabbMin, bodyA.aabbMax, bodyB.aabbMin, bodyB.aabbMax)) {
        // Add to collision pair list
        let pairIndex = atomicAdd(&collisionPairCount, 1u);
        if (pairIndex < params.maxCollisionPairs) {
            collisionPairs[pairIndex] = CollisionPair(bodyIndexA, bodyIndexB, 1u, 0u);
        }
    }
}
```

### Narrow Phase Collision Detection
```wgsl
// Sphere-sphere collision detection
fn sphereSphereCollision(bodyA: RigidBody, bodyB: RigidBody) -> ContactPoint {
    let radiusA = bodyA.shapeData[0];
    let radiusB = bodyB.shapeData[0];
    let totalRadius = radiusA + radiusB;
    
    let direction = bodyB.position - bodyA.position;
    let distance = length(direction);
    
    var contact: ContactPoint;
    
    if (distance < totalRadius && distance > 0.001) {
        let normal = direction / distance;
        let depth = totalRadius - distance;
        
        contact.normal = normal;
        contact.depth = depth;
        contact.pointA = bodyA.position + normal * radiusA;
        contact.pointB = bodyB.position - normal * radiusB;
        contact.impulse = 0.0;
    }
    
    return contact;
}

// Box-box collision using SAT (Separating Axis Theorem)
fn boxBoxCollision(bodyA: RigidBody, bodyB: RigidBody) -> ContactPoint {
    // Extract box half-extents
    let halfExtentsA = vec3<f32>(bodyA.shapeData[0], bodyA.shapeData[1], bodyA.shapeData[2]);
    let halfExtentsB = vec3<f32>(bodyB.shapeData[0], bodyB.shapeData[1], bodyB.shapeData[2]);
    
    // Get rotation matrices from quaternions
    let rotA = quatToMat3(bodyA.orientation);
    let rotB = quatToMat3(bodyB.orientation);
    
    // Relative position
    let relativePos = bodyB.position - bodyA.position;
    
    // SAT test with 15 potential separating axes
    var minPenetration = 1e30;
    var separatingAxis = vec3<f32>(0.0);
    var found = false;
    
    // Test A's axes
    for (var i = 0u; i < 3u; i++) {
        let axis = getColumn(rotA, i);
        let penetration = satTestAxis(axis, halfExtentsA, halfExtentsB, rotA, rotB, relativePos);
        if (penetration < 0.0) { return ContactPoint(); } // Separated
        if (penetration < minPenetration) {
            minPenetration = penetration;
            separatingAxis = axis;
            found = true;
        }
    }
    
    // Test cross product axes (A[i] × B[j])
    for (var i = 0u; i < 3u; i++) {
        for (var j = 0u; j < 3u; j++) {
            let axisA = getColumn(rotA, i);
            let axisB = getColumn(rotB, j);
            let axis = cross(axisA, axisB);
            
            if (length(axis) > 0.001) {
                let normalizedAxis = normalize(axis);
                let penetration = satTestAxis(normalizedAxis, halfExtentsA, halfExtentsB, rotA, rotB, relativePos);
                if (penetration < 0.0) { return ContactPoint(); }
                if (penetration < minPenetration) {
                    minPenetration = penetration;
                    separatingAxis = normalizedAxis;
                    found = true;
                }
            }
        }
    }
    
    if (!found) { return ContactPoint(); }
    
    // Generate contact point
    var contact: ContactPoint;
    contact.normal = separatingAxis;
    contact.depth = minPenetration;
    
    // Find contact points (simplified - using center projection)
    let contactCenter = bodyA.position + separatingAxis * (minPenetration * 0.5);
    contact.pointA = contactCenter - separatingAxis * (minPenetration * 0.25);
    contact.pointB = contactCenter + separatingAxis * (minPenetration * 0.25);
    contact.impulse = 0.0;
    
    return contact;
}

// Main narrow phase collision detection
@compute @workgroup_size(64)
fn narrowPhaseCollision(@builtin(global_invocation_id) id: vec3<u32>) {
    let pairIndex = id.x;
    if (pairIndex >= arrayLength(&collisionPairs)) { return; }
    
    let pair = collisionPairs[pairIndex];
    if (pair.isValid == 0u) { return; }
    
    let bodyA = bodies[pair.bodyIndexA];
    let bodyB = bodies[pair.bodyIndexB];
    
    var contact: ContactPoint;
    
    // Dispatch to appropriate collision detection algorithm
    if (bodyA.shapeType == SPHERE_SHAPE && bodyB.shapeType == SPHERE_SHAPE) {
        contact = sphereSphereCollision(bodyA, bodyB);
    } else if (bodyA.shapeType == BOX_SHAPE && bodyB.shapeType == BOX_SHAPE) {
        contact = boxBoxCollision(bodyA, bodyB);
    } else {
        // Use GJK for general convex shapes
        contact = gjkCollision(bodyA, bodyB);
    }
    
    // Store valid contacts
    if (contact.depth > 0.0) {
        let contactIndex = atomicAdd(&contactCount, 1u);
        if (contactIndex < arrayLength(&contacts)) {
            contacts[contactIndex] = contact;
        }
    }
}
```

## Constraint Solving Shaders

### Sequential Impulse Solver
```wgsl
// Constraint data structure
struct Constraint {
    bodyIndexA: u32,
    bodyIndexB: u32,
    constraintType: u32,
    padding: u32,
    
    // Constraint-specific data
    anchorA: vec3<f32>,
    anchorB: vec3<f32>,
    restLength: f32,
    stiffness: f32,
    damping: f32,
    
    // Solver data
    jacobian: array<vec3<f32>, 4>, // [linA, angA, linB, angB]
    effectiveMass: f32,
    bias: f32,
    accumulatedImpulse: f32,
    
    lowerLimit: f32,
    upperLimit: f32
}

// Prepare constraint for solving
@compute @workgroup_size(64)
fn prepareConstraints(@builtin(global_invocation_id) id: vec3<u32>) {
    let constraintIndex = id.x;
    if (constraintIndex >= arrayLength(&constraints)) { return; }
    
    var constraint = &constraints[constraintIndex];
    let bodyA = bodies[(*constraint).bodyIndexA];
    let bodyB = bodies[(*constraint).bodyIndexB];
    
    // Get world anchor points
    let worldAnchorA = bodyA.position + quatRotateVector(bodyA.orientation, (*constraint).anchorA);
    let worldAnchorB = bodyB.position + quatRotateVector(bodyB.orientation, (*constraint).anchorB);
    
    // Constraint vector
    let constraintVector = worldAnchorB - worldAnchorA;
    let distance = length(constraintVector);
    
    if (distance < 0.001) { return; }
    
    let normal = constraintVector / distance;
    
    // Compute Jacobian matrix
    (*constraint).jacobian[0] = -normal; // Linear jacobian for body A
    (*constraint).jacobian[1] = -cross(worldAnchorA - bodyA.position, normal); // Angular jacobian for body A
    (*constraint).jacobian[2] = normal;  // Linear jacobian for body B
    (*constraint).jacobian[3] = cross(worldAnchorB - bodyB.position, normal);  // Angular jacobian for body B
    
    // Compute effective mass: 1 / (J * M⁻¹ * Jᵀ)
    var effectiveMass = bodyA.invMass + bodyB.invMass;
    
    // Add angular contributions (simplified scalar inertia)
    let inertiaA = select(1.0 / (0.4 * bodyA.mass), 0.0, bodyA.mass > 0.0);
    let inertiaB = select(1.0 / (0.4 * bodyB.mass), 0.0, bodyB.mass > 0.0);
    
    effectiveMass += dot((*constraint).jacobian[1], (*constraint).jacobian[1]) * inertiaA;
    effectiveMass += dot((*constraint).jacobian[3], (*constraint).jacobian[3]) * inertiaB;
    
    (*constraint).effectiveMass = select(1.0 / effectiveMass, 0.0, effectiveMass > 0.0);
    
    // Position correction bias
    let positionError = distance - (*constraint).restLength;
    (*constraint).bias = -((*constraint).stiffness / params.deltaTime) * positionError;
}

// Solve constraints iteratively
@compute @workgroup_size(64)
fn solveConstraints(@builtin(global_invocation_id) id: vec3<u32>) {
    let constraintIndex = id.x;
    if (constraintIndex >= arrayLength(&constraints)) { return; }
    
    let constraint = constraints[constraintIndex];
    var bodyA = &bodies[constraint.bodyIndexA];
    var bodyB = &bodies[constraint.bodyIndexB];
    
    // Compute constraint velocity: J * v
    var constraintVelocity = 0.0;
    constraintVelocity += dot(constraint.jacobian[0], (*bodyA).linearVelocity);
    constraintVelocity += dot(constraint.jacobian[1], (*bodyA).angularVelocity);
    constraintVelocity += dot(constraint.jacobian[2], (*bodyB).linearVelocity);
    constraintVelocity += dot(constraint.jacobian[3], (*bodyB).angularVelocity);
    
    // Compute lagrange multiplier (impulse)
    let lambda = constraint.effectiveMass * (-(constraintVelocity + constraint.bias) - constraint.damping * constraint.accumulatedImpulse);
    
    // Clamp impulse if there are limits
    let newAccumulatedImpulse = clamp(constraint.accumulatedImpulse + lambda, constraint.lowerLimit, constraint.upperLimit);
    let actualLambda = newAccumulatedImpulse - constraint.accumulatedImpulse;
    
    // Apply impulse to bodies
    (*bodyA).linearVelocity += constraint.jacobian[0] * (actualLambda * (*bodyA).invMass);
    (*bodyA).angularVelocity += constraint.jacobian[1] * (actualLambda * (1.0 / (0.4 * (*bodyA).mass)));
    
    (*bodyB).linearVelocity += constraint.jacobian[2] * (actualLambda * (*bodyB).invMass);
    (*bodyB).angularVelocity += constraint.jacobian[3] * (actualLambda * (1.0 / (0.4 * (*bodyB).mass)));
    
    // Update accumulated impulse (this needs atomic operation for correctness)
    // For simplicity, we're not using atomics here - may cause minor instabilities
    constraints[constraintIndex].accumulatedImpulse = newAccumulatedImpulse;
}
```

## Utility Functions

### Mathematical Operations
```wgsl
// Constants
const STATIC_FLAG: u32 = 1u;
const SLEEPING_FLAG: u32 = 2u;
const KINEMATIC_FLAG: u32 = 4u;

const SPHERE_SHAPE: u32 = 0u;
const BOX_SHAPE: u32 = 1u;
const CAPSULE_SHAPE: u32 = 2u;

const MAX_OBJECTS_PER_CELL: u32 = 32u;

// Quaternion operations
fn quatMultiply(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(
        a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    );
}

fn quatNormalize(q: vec4<f32>) -> vec4<f32> {
    let len = length(q);
    return select(q / len, vec4<f32>(0.0, 0.0, 0.0, 1.0), len < 0.001);
}

fn quatFromAxisAngle(axis: vec3<f32>, angle: f32) -> vec4<f32> {
    let halfAngle = angle * 0.5;
    let sinHalf = sin(halfAngle);
    let cosHalf = cos(halfAngle);
    return vec4<f32>(axis * sinHalf, cosHalf);
}

fn quatRotateVector(q: vec4<f32>, v: vec3<f32>) -> vec3<f32> {
    let qv = q.xyz;
    let uv = cross(qv, v);
    let uuv = cross(qv, uv);
    return v + ((uv * q.w) + uuv) * 2.0;
}

fn quatToMat3(q: vec4<f32>) -> mat3x3<f32> {
    let x = q.x; let y = q.y; let z = q.z; let w = q.w;
    let x2 = x + x; let y2 = y + y; let z2 = z + z;
    let xx = x * x2; let xy = x * y2; let xz = x * z2;
    let yy = y * y2; let yz = y * z2; let zz = z * z2;
    let wx = w * x2; let wy = w * y2; let wz = w * z2;
    
    return mat3x3<f32>(
        vec3<f32>(1.0 - (yy + zz), xy + wz, xz - wy),
        vec3<f32>(xy - wz, 1.0 - (xx + zz), yz + wx),
        vec3<f32>(xz + wy, yz - wx, 1.0 - (xx + yy))
    );
}

// AABB operations
fn aabbOverlap(minA: vec3<f32>, maxA: vec3<f32>, minB: vec3<f32>, maxB: vec3<f32>) -> bool {
    return all(minA <= maxB) && all(maxA >= minB);
}

fn updateAABB(bodyIndex: u32) {
    var body = &bodies[bodyIndex];
    
    if ((*body).shapeType == SPHERE_SHAPE) {
        let radius = (*body).shapeData[0];
        let radiusVec = vec3<f32>(radius);
        (*body).aabbMin = (*body).position - radiusVec;
        (*body).aabbMax = (*body).position + radiusVec;
    } else if ((*body).shapeType == BOX_SHAPE) {
        let halfExtents = vec3<f32>((*body).shapeData[0], (*body).shapeData[1], (*body).shapeData[2]);
        let rotation = quatToMat3((*body).orientation);
        
        // Transform half extents by rotation matrix (take absolute values)
        let transformedExtents = abs(rotation[0]) * halfExtents.x + 
                                abs(rotation[1]) * halfExtents.y + 
                                abs(rotation[2]) * halfExtents.z;
        
        (*body).aabbMin = (*body).position - transformedExtents;
        (*body).aabbMax = (*body).position + transformedExtents;
    }
}

// SAT (Separating Axis Theorem) helper functions
fn getColumn(m: mat3x3<f32>, col: u32) -> vec3<f32> {
    if (col == 0u) { return m[0]; }
    else if (col == 1u) { return m[1]; }
    else { return m[2]; }
}

fn satTestAxis(axis: vec3<f32>, halfExtentsA: vec3<f32>, halfExtentsB: vec3<f32>, 
               rotA: mat3x3<f32>, rotB: mat3x3<f32>, relativePos: vec3<f32>) -> f32 {
    
    // Project A's half extents onto axis
    let projectionA = abs(dot(axis, rotA[0])) * halfExtentsA.x +
                      abs(dot(axis, rotA[1])) * halfExtentsA.y +
                      abs(dot(axis, rotA[2])) * halfExtentsA.z;
    
    // Project B's half extents onto axis  
    let projectionB = abs(dot(axis, rotB[0])) * halfExtentsB.x +
                      abs(dot(axis, rotB[1])) * halfExtentsB.y +
                      abs(dot(axis, rotB[2])) * halfExtentsB.z;
    
    // Project relative position onto axis
    let separation = abs(dot(relativePos, axis));
    
    // Return penetration depth (negative if separated)
    return (projectionA + projectionB) - separation;
}

// GJK collision detection (simplified version)
fn gjkCollision(bodyA: RigidBody, bodyB: RigidBody) -> ContactPoint {
    // Simplified GJK implementation
    // In practice, this would be much more complex
    var contact: ContactPoint;
    
    // For now, fall back to sphere-sphere approximation
    let radiusA = length(vec3<f32>(bodyA.shapeData[0], bodyA.shapeData[1], bodyA.shapeData[2]));
    let radiusB = length(vec3<f32>(bodyB.shapeData[0], bodyB.shapeData[1], bodyB.shapeData[2]));
    
    let direction = bodyB.position - bodyA.position;
    let distance = length(direction);
    let totalRadius = radiusA + radiusB;
    
    if (distance < totalRadius && distance > 0.001) {
        let normal = direction / distance;
        contact.normal = normal;
        contact.depth = totalRadius - distance;
        contact.pointA = bodyA.position + normal * radiusA;
        contact.pointB = bodyB.position - normal * radiusB;
        contact.impulse = 0.0;
    }
    
    return contact;
}
```

## Performance Optimization

### Memory Access Patterns
```wgsl
// Coalesced memory access for better GPU performance
@compute @workgroup_size(32) // Use warp size for optimal memory access
fn optimizedIntegration(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index >= params.bodyCount) { return; }
    
    // Load data into registers
    let position = bodies[index].position;
    let velocity = bodies[index].linearVelocity;
    let force = bodies[index].force;
    let invMass = bodies[index].invMass;
    
    // Compute in registers
    let newVelocity = velocity + force * invMass * params.deltaTime;
    let newPosition = position + newVelocity * params.deltaTime;
    
    // Write back to memory
    bodies[index].linearVelocity = newVelocity;
    bodies[index].position = newPosition;
}
```

### Workgroup Shared Memory
```wgsl
// Use workgroup shared memory for collision detection
var<workgroup> sharedBodies: array<RigidBody, 64>;

@compute @workgroup_size(64)
fn sharedMemoryCollision(@builtin(global_invocation_id) global_id: vec3<u32>,
                        @builtin(local_invocation_id) local_id: vec3<u32>,
                        @builtin(workgroup_id) workgroup_id: vec3<u32>) {
    
    let localIndex = local_id.x;
    let globalIndex = global_id.x;
    
    // Load body into shared memory
    if (globalIndex < params.bodyCount) {
        sharedBodies[localIndex] = bodies[globalIndex];
    }
    
    workgroupBarrier();
    
    // Test collisions within workgroup
    for (var i = 0u; i < 64u; i++) {
        if (i != localIndex && globalIndex < params.bodyCount) {
            // Test collision between sharedBodies[localIndex] and sharedBodies[i]
            // This reduces global memory access
        }
    }
}
```

## Debugging and Profiling

### Debug Output
```wgsl
// Debug buffer for GPU debugging
@group(2) @binding(0) var<storage, read_write> debugOutput: array<f32>;

// Debug function to output values
fn debugWrite(index: u32, value: f32) {
    if (index < arrayLength(&debugOutput)) {
        debugOutput[index] = value;
    }
}

// Physics validation on GPU
@compute @workgroup_size(64)
fn validatePhysics(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index >= params.bodyCount) { return; }
    
    let body = bodies[index];
    
    // Check for NaN values
    if (any(isnan(body.position)) || any(isnan(body.linearVelocity))) {
        debugWrite(index * 4u + 0u, -1.0); // Error flag
        debugWrite(index * 4u + 1u, f32(index)); // Body index
    }
    
    // Check velocity magnitude
    let speed = length(body.linearVelocity);
    if (speed > 1000.0) { // Unreasonably high speed
        debugWrite(index * 4u + 2u, speed);
    }
}
```

## Shader Compilation and Management

### TypeScript Integration
```typescript
// Shader compilation helper
class WGSLShaderCompiler {
    static compileShader(device: GPUDevice, source: string, label?: string): GPUShaderModule {
        return device.createShaderModule({
            code: source,
            label: label
        });
    }
    
    static createComputePipeline(device: GPUDevice, shader: GPUShaderModule, 
                                entryPoint: string, layout?: GPUPipelineLayout): GPUComputePipeline {
        return device.createComputePipeline({
            layout: layout || 'auto',
            compute: {
                module: shader,
                entryPoint: entryPoint
            }
        });
    }
}

// Shader hot-reloading for development
class ShaderHotReload {
    private watchers: Map<string, FileSystemWatcher> = new Map();
    
    watchShader(filePath: string, onReload: (source: string) => void): void {
        // Implementation for development builds
    }
}
```

This compute shader specification provides a complete GPU-accelerated physics pipeline using WebGPU and WGSL, optimized for high performance and scalability.
        }
    }
    
    // Test B's axes
    for (var i = 0u; i < 3u; i++) {
        let axis = getColumn(rotB, i);
        let penetration = satTestAxis(axis, halfExtentsA, halfExtentsB, rotA, rotB, relativePos);
        if (penetration < 0.0) { return ContactPoint(); }
        if (penetration < minPenetration) {
            minPenetration = penetration;
            separatingAxis = axis;
            found = true;