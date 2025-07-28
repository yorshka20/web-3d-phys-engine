# WebGPU 3D Physics Engine

A high-performance 3D physics engine built from scratch using WebGPU for both rendering and physics computation.

## Project Overview

This project aims to build a complete physics engine using modern web technologies:

- **WebGPU** for graphics and compute shaders
- **TypeScript** for type safety and maintainability
- **Vite** for fast development and building
- **Vanilla JavaScript/TypeScript** (no React/Vue dependencies)

## Project Structure

```
src/
├── math/           # Mathematical utilities (Vector3, Matrix4, Quaternion)
├── renderer/       # WebGPU rendering system
├── physics/        # Physics simulation core
├── shaders/        # WGSL compute and rendering shaders
├── scene/          # Scene management and spatial organization
├── utils/          # Memory pools, debugging, and profiling tools
├── engine/         # Main engine coordination
└── main.ts         # Application entry point

plans/              # Development documentation and specifications
tests/              # Unit tests and test utilities
```

## Development Setup

### Prerequisites

- Node.js 18+
- Modern browser with WebGPU support (Chrome Canary, Firefox Nightly)

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

This will start a development server at `http://localhost:3000`

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Package Management

This project uses pnpm as the package manager. Common commands:

- `pnpm add <package>` - Add a dependency
- `pnpm add -D <package>` - Add a dev dependency
- `pnpm remove <package>` - Remove a dependency
- `pnpm update` - Update all dependencies

## Browser Support

WebGPU is currently in development. To test this project:

1. **Chrome Canary**: Enable `#enable-unsafe-webgpu` flag
2. **Firefox Nightly**: Enable `dom.webgpu.enabled` in about:config
3. **Safari**: WebGPU support is experimental

## Development Phases

### Phase 1: Foundation ✅

- [x] Project structure setup
- [x] TypeScript configuration
- [x] Vite build system
- [x] Basic WebGPU initialization
- [ ] Math library implementation
- [ ] Basic shader system

### Phase 2: Core Physics

- [ ] Rigid body class structure
- [ ] Basic integration methods
- [ ] Simple collision detection (AABB)
- [ ] Gravity simulation

### Phase 3: Advanced Physics

- [ ] Spatial partitioning (Octree)
- [ ] SAT collision detection
- [ ] Impulse-based collision response
- [ ] Constraint system basics

### Phase 4: GPU Acceleration

- [ ] Compute shader integration
- [ ] Parallel physics simulation
- [ ] GPU-CPU data synchronization
- [ ] Performance optimization

### Phase 5: Features & Polish

- [ ] Advanced constraints (joints, springs)
- [ ] Sleeping/waking system
- [ ] Debug visualization
- [ ] Profiling and optimization

## Current Status

The project is currently in **Phase 1** with basic setup complete. The application can:

- Initialize WebGPU context
- Display a canvas with dark background
- Show UI controls (non-functional)
- Handle window resizing

Next steps involve implementing the math library and basic rendering pipeline.

## Contributing

1. Follow the established project structure
2. Use TypeScript with strict mode
3. Write tests for new features
4. Follow the coding standards outlined in the plans

## License

MIT License
