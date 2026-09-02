# Shader Composition System

This directory contains the modular shader system for the WebGPU 3D Physics Engine. The system is designed to support code reuse, maintainability, and efficient shader compilation.

## Architecture Overview

### 1. Fragment-Based Design

- **Core fragments** (`core/`): Essential structures, types, and constants
- **Math fragments** (`math/`): Mathematical utility functions
- **Lighting fragments** (`lighting/`): Lighting model implementations
- **Binding fragments** (`bindings/`): WebGPU binding group definitions
- **Material shaders** (`materials/`): Complete shader implementations
- **Pass fragments** (`passes/`): Rendering pass implementations

### 2. Composition System

Shaders are composed at runtime by the `ShaderCompiler` using the `includes` array in `ShaderModule` definitions:

```typescript
const shaderModule: ShaderModule = {
  id: 'coordinate_shader',
  sourceFile: 'Coordinate.wgsl',
  includes: [
    'core/uniforms.wgsl', // Time and MVP uniforms
    'core/vertex_types.wgsl', // Vertex input/output structures
    'bindings/simple_bindings.wgsl', // Binding group definitions
  ],
  // ... other properties
};
```

### 3. Registry System

All shader fragments are managed through `registry.ts`: `shaderFragmentRegistry` globs every
`.wgsl` under this directory (`import.meta.glob`, inlined as strings by the Vite
`wgsl-loader`) and keys it by its path relative to `shaders/` — `core/uniforms.wgsl`,
`materials/HGRPNpr.wgsl`. Dropping a file into the tree is its registration. Lookups go through
`resolveShaderFragment(path)`, which falls back to fragments a family **generates on demand**
under `generated/` and memoizes them: the HGRP material contract (`material/hgrp/wgsl.ts`)
emits its uniform structs, one group-2 binding block per shader permutation and one off-stub
per static subsystem, so the WGSL declarations, the bind group layout and the CPU packer share
one declaration table.

Shader modules (a source file + includes + render state) are declared by factories in
`create.ts` and listed once in `createShaderModules()`; `ShaderManager` registers that list and
**compiles a module on first use** with the defines it declares. Nothing is compiled at startup.
An id the catalog does not list is handed to `createDerivedShaderModule(id)`: HGRP material
and pass shaders are derived from their permutation id (`hgrp_skin_shader+ramp+shadowLut`)
the first time a pipeline asks for them, so only the permutations the scene resolves to exist.

```typescript
import { resolveShaderFragment, shaderFragmentRegistry } from './registry';

// Get available (materialized) fragments
const fragments = Array.from(shaderFragmentRegistry.keys());

// Get fragment content — files and generated fragments alike
const uniformsContent = resolveShaderFragment('core/uniforms.wgsl');
```

### 4. Subsystem hooks (HGRP)

The HGRP shading core (`lighting/hgrp_npr.wgsl`, `lighting/hgrp_eye_shading.wgsl`) calls one
hook function per static subsystem — `hgrp_ramp_weight`, `hgrp_shadow_color`,
`hgrp_shading_normal`, `hgrp_shade_coord`, `hgrp_spec_ramp_color`, `hgrp_metallic_gloss`,
`hgrp_emission`, `hgrp_hair_lines`, `hgrp_face_highlight`, `hgrp_eye_matcap` — without
knowing whether the subsystem is on. The permutation's include list supplies either the hook's
fragment (`lighting/hgrp/<subsystem>.wgsl`, which samples the subsystem's texture) or a
generated off-stub whose signature is copied from that fragment and whose body returns the
neutral value declared in `material/hgrp/subsystems.ts`. No `#ifdef`, no `select(..., gate)`:
a disabled subsystem's texture is not declared, not bound and never sampled.

## Directory Structure

```
shaders/
├── core/                    # Core shader fragments
│   ├── uniforms.wgsl       # Uniform structures (Time, MVP, Material)
│   ├── vertex_types.wgsl   # Vertex input/output structures
│   ├── constants.wgsl      # Global constants
│   └── types.wgsl          # Type aliases
├── math/                   # Mathematical utilities
│   ├── color.wgsl         # Color space conversions
│   ├── geometry.wgsl      # Geometry calculations
│   ├── vector.wgsl        # Vector operations
│   └── noise.wgsl         # Noise functions
├── lighting/               # Lighting models
│   ├── phong.wgsl         # Phong lighting
│   ├── pbr.wgsl           # Physically-based rendering
│   ├── toon.wgsl          # Toon shading
│   ├── hgrp_npr.wgsl      # HGRP shading core (calls the subsystem hooks)
│   └── hgrp/              # HGRP static subsystem hooks, one per subsystem (ramp, sdf, ...)
├── bindings/               # Binding group definitions
│   ├── pmx_bindings.wgsl  # PMX model bindings
│   ├── water_bindings.wgsl # Water material bindings
│   ├── fire_bindings.wgsl # Fire material bindings
│   └── simple_bindings.wgsl # Basic bindings
├── materials/              # Complete material shaders
│   ├── PMXMaterial.wgsl   # PMX model material
│   ├── WaterMaterial.wgsl # Water animation material
│   ├── FireMaterial.wgsl  # Fire effect material
│   ├── Coordinate.wgsl    # Coordinate visualization
│   ├── Checkerboard.wgsl  # Checkerboard pattern
│   ├── Emissive.wgsl      # Emissive material
│   └── Pulsewave.wgsl     # Pulsewave effect
├── passes/                 # Rendering passes
│   ├── forward.wgsl       # Forward rendering
│   ├── deferred.wgsl      # Deferred rendering
│   └── shadow.wgsl        # Shadow mapping
├── types/                  # TypeScript definitions
│   └── material.ts        # ShaderModule interfaces and factories
├── registry.ts            # Shader fragment registry
└── test-composition.ts    # Composition testing utilities
```

## Usage Examples

### Creating a New Shader Module

1. **Define the shader interface** in `types/material.ts`:

```typescript
export interface MyShaderModule extends ShaderModule {
  id: 'my_shader';
  sourceFile: 'MyShader.wgsl';
  includes: ['core/uniforms.wgsl', 'math/color.wgsl'];
  compilationOptions: {
    vertexFormat: ['full'];
    defines: { ENABLE_FEATURE: true };
  };
}
```

2. **Create the factory function**:

```typescript
export function createMyShaderModule(): MyShaderModule {
  return {
    id: 'my_shader',
    sourceFile: 'MyShader.wgsl',
    includes: ['core/uniforms.wgsl', 'math/color.wgsl'],
    // ... other properties
  };
}
```

3. **Add the shader file** to `materials/MyShader.wgsl`:

```wgsl
// This file contains only the main shader logic
// All common structures and functions are included via includes

@vertex
fn vs_main(input: FullVertexInput) -> FullVertexOutput {
  // Vertex shader logic
}

@fragment
fn fs_main(input: FullVertexOutput) -> @location(0) vec4<f32> {
  // Fragment shader logic using included functions
}
```

4. **Registration is automatic** — the file is picked up by the `registry.ts` glob under its
   path relative to `shaders/` (`materials/MyShader.wgsl`).

5. **Wire it up** — add the factory to the `createShaderModules()` catalog in `create.ts`.
   `ShaderManager` registers the catalog and compiles the module the first time a pipeline
   asks for `customShaderId: 'my_shader'`. (A family whose shaders are derived from an id,
   like HGRP's permutations, instead teaches `createDerivedShaderModule` to build them.)

### Compiling Shaders

```typescript
import { ShaderCompiler } from './ShaderCompiler';
import { createMyShaderModule } from './types/material';

const compiler = new ShaderCompiler();
const shaderModule = createMyShaderModule();

// Compile with custom defines
const result = compiler.compileShader(shaderModule, {
  defines: { ENABLE_DEBUG: true },
});

if (result.success) {
  const compiledShader = result.compiledShader;
  // Use the compiled shader
}
```

## Best Practices

### 1. Fragment Organization

- Keep fragments focused on a single responsibility
- Use descriptive names that indicate the fragment's purpose
- Place common functionality in appropriate core fragments

### 2. Include Management

- Always include necessary core fragments first
- Group related includes together (core → math → lighting → bindings)
- Avoid circular dependencies between fragments

### 3. Naming Conventions

- Use lowercase with underscores for file names
- Use PascalCase for struct names
- Use camelCase for function names
- Use UPPER_CASE for constants

### 4. Performance Considerations

- Cache compiled shaders when possible
- Minimize the number of includes to reduce composition time
- Select optional features by composing the include list (hook fragment vs off-stub, see
  Subsystem hooks) rather than `#ifdef` — the preprocessor is a single non-nesting regex

## Testing

Use the test utilities in `test-composition.ts` to verify shader composition:

```typescript
import { testShaderComposition } from './test-composition';

// Run composition tests
testShaderComposition();
```

## Migration Guide

When migrating from monolithic shader files:

1. **Extract common structures** to appropriate core fragments
2. **Move utility functions** to math fragments
3. **Separate binding definitions** to binding fragments
4. **Update ShaderModule includes** to reference new fragments
5. **Test composition** to ensure all dependencies are resolved

## Troubleshooting

### Common Issues

1. **Missing fragments**: Ensure all includes are registered in `shaderFragmentRegistry`
2. **Circular dependencies**: Avoid including fragments that depend on each other
3. **Type mismatches**: Verify that vertex formats match between shaders and includes
4. **Binding conflicts**: Ensure binding group numbers don't conflict between includes

### Debug Tools

- Use `getAvailableFragments()` to list all registered fragments
- Use `getFragmentContent()` to inspect fragment contents
- Use `validateShaderModule()` to check for missing dependencies
- Use `getCompositionPreview()` to estimate compilation size and complexity
