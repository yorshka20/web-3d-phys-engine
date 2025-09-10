# Pipeline Test Suite

This directory contains comprehensive tests for the WebGPU pipeline system, including resource preparation, pipeline management, and factory functionality.

## Test Structure

```
test/
├── index.ts                    # Main test exports and runner
├── runTests.ts                 # Command-line test runner
├── ResourcePreparationTest.ts  # Resource preparation tests
├── PipelineManagerTest.ts      # Pipeline manager tests
├── PipelineFactoryTest.ts      # Pipeline factory tests
└── README.md                   # This file
```

## Running Tests

### Command Line

```bash
# Run all tests
npx tsx packages/renderer/src/webGPU/core/pipeline/test/runTests.ts

# Run with verbose output
npx tsx packages/renderer/src/webGPU/core/pipeline/test/runTests.ts --verbose

# Run with filter
npx tsx packages/renderer/src/webGPU/core/pipeline/test/runTests.ts --filter=Resource
```

### Programmatic

```typescript
import { runAllPipelineTests } from './test';

// Run all tests
await runAllPipelineTests();

// Run specific test suites
import { runResourcePreparationTests } from './test/ResourcePreparationTest';
await runResourcePreparationTests();
```

## Test Categories

### 1. Resource Preparation Tests (`ResourcePreparationTest.ts`)

- **Purpose**: Verify that essential bind group layouts are created during renderer initialization
- **Coverage**:
  - Time bind group layout creation
  - MVP bind group layout creation
  - Material bind group layout creation
  - Resource existence validation

### 2. Pipeline Manager Tests (`PipelineManagerTest.ts`)

- **Purpose**: Test pipeline creation, caching, and management functionality
- **Coverage**:
  - Pipeline creation with valid semantic keys
  - Pipeline caching and cache hits
  - Cache size management and eviction
  - Cache statistics and monitoring

### 3. Pipeline Factory Tests (`PipelineFactoryTest.ts`)

- **Purpose**: Test pipeline factory functionality and predefined configurations
- **Coverage**:
  - Basic pipeline creation
  - Predefined configuration usage
  - Specialized pipeline types (opaque, transparent, wireframe, etc.)
  - Batch pipeline creation
  - Configuration management

## Test Configuration

The test suite uses a centralized configuration in `index.ts`:

```typescript
export const TestConfig = {
  // Mock device limits for testing
  mockDeviceLimits: {
    maxStorageBufferBindingSize: 1024 * 1024 * 64, // 64MB
    maxComputeWorkgroupStorageSize: 32768,
    maxComputeInvocationsPerWorkgroup: 1024,
  },

  // Test canvas dimensions
  testCanvasSize: {
    width: 800,
    height: 600,
  },

  // Test timeout
  timeout: 5000, // 5 seconds
} as const;
```

## Mocking Strategy

The tests use comprehensive mocking to avoid dependencies on actual WebGPU implementations:

- **WebGPU Device**: Mocked with all necessary methods
- **WebGPU Context**: Mocked with device and adapter access
- **Resource Manager**: Mocked with resource retrieval methods
- **Shader Manager**: Mocked with shader creation methods

## Adding New Tests

To add new tests:

1. Create a new test file following the naming pattern: `[ComponentName]Test.ts`
2. Export test functions and a main runner function
3. Add the new test to `index.ts` exports
4. Include the test in `runAllPipelineTests()`

Example:

```typescript
// NewComponentTest.ts
export async function testNewFeature(): Promise<boolean> {
  // Test implementation
}

export async function runNewComponentTests(): Promise<void> {
  // Test runner implementation
}
```

## Test Output

The test suite provides detailed output including:

- ✅ Passed tests
- ❌ Failed tests
- 📊 Test statistics
- ⏱️ Execution time
- 🔍 Filtered results (when using filters)

## Continuous Integration

These tests are designed to run in CI environments:

- No external dependencies
- Comprehensive mocking
- Clear pass/fail reporting
- Configurable verbosity
- Exit codes for automation
