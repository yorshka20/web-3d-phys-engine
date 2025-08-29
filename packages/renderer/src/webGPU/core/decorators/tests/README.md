# DI Decorator Tests

This directory contains comprehensive test suites for the WebGPU Dependency Injection decorator system.

## Test Files

### 1. `DI.test.ts` - Core DI Container Tests

Tests the basic functionality of the DI container:

- Service registration and resolution
- Singleton vs transient lifecycle
- Service metadata management
- Child container functionality
- Auto-registration with options

### 2. `DecoratorExecution.test.ts` - Decorator Execution Tests

Tests the execution order and behavior of decorators:

- Injectable decorator constructor interception
- Inject decorator property injection
- Resource decorators (AutoRegisterResource, SmartResource)
- Complex decorator combinations
- Error handling in decorators

### 3. `Performance.test.ts` - Performance Tests

Tests the performance characteristics of the DI system:

- Decorator overhead measurement
- Container resolution performance
- Memory usage and leak detection
- MonitorPerformance decorator functionality

## Running Tests

### Using Vitest (Recommended)

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test DI.test.ts

# Run with coverage
pnpm test --coverage

# Run in watch mode
pnpm test --watch
```

### Using the Test Runner Script

```bash
# Run the custom test runner
pnpm tsx tests/run-tests.ts
```

## Test Structure

Each test file follows a consistent structure:

```typescript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('Specific Functionality', () => {
    it('should do something specific', () => {
      // Test implementation
    });
  });
});
```

## Mock Services

The tests use mock services to avoid dependencies on actual WebGPU implementations:

- `MockResourceManager` - Simulates resource management
- `MockGeometryManager` - Simulates geometry operations
- `MockDevice` - Simulates WebGPU device

## Key Test Scenarios

### 1. Auto-Registration

```typescript
@Injectable(ServiceTokens.BUFFER_MANAGER, { lifecycle: 'singleton' })
class BufferManager {
  constructor() {}
}

const instance = new BufferManager();
// Instance is automatically registered in the container
```

### 2. Dependency Injection

```typescript
@Injectable()
class TestClass {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  resourceManager!: ResourceManager;
}

const instance = new TestClass();
// resourceManager is automatically injected
```

### 3. Performance Monitoring

```typescript
@Injectable()
class TestManager {
  @MonitorPerformance({ logThreshold: 1 })
  expensiveOperation() {
    // Operation implementation
  }
}
```

## Coverage Goals

The test suite aims for:

- **100% line coverage** for core DI functionality
- **90%+ branch coverage** for decorator logic
- **Performance benchmarks** for critical paths
- **Memory leak detection** for long-running scenarios

## Debugging Tests

### Enable Debug Logging

Set environment variable to see detailed logs:

```bash
DEBUG=di:* pnpm test
```

### Run Single Test

```bash
pnpm test --run DI.test.ts -t "should register and resolve instances"
```

### Performance Profiling

```bash
# Run performance tests with profiling
pnpm test Performance.test.ts --reporter=verbose
```

## Contributing

When adding new tests:

1. Follow the existing naming conventions
2. Use descriptive test names
3. Include both positive and negative test cases
4. Add performance tests for new features
5. Update this README if adding new test categories

## Troubleshooting

### Common Issues

1. **Tests failing with "Service not registered"**
   - Ensure `globalContainer.clear()` is called in `beforeEach`
   - Check that services are registered before resolution

2. **Performance tests timing out**
   - Increase timeout for performance tests
   - Check for infinite loops in test code

3. **Memory tests failing**
   - Ensure proper cleanup in `afterEach`
   - Check for circular references in mock objects

### Debug Mode

Enable debug mode to see detailed execution logs:

```typescript
// In test file
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
// ... test code ...
consoleSpy.mockRestore();
```
