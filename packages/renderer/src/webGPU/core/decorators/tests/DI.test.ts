import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DIContainer, globalContainer, ServiceTokens } from '../DIContainer';
import { Inject, Injectable } from '../ResourceDecorators';

// Mock services for testing
class MockResourceManager {
  name = 'MockResourceManager';

  test() {
    return 'Resource manager working';
  }
}

class MockGeometryManager {
  name = 'MockGeometryManager';

  getGeometry(type: string) {
    return {
      geometry: {
        vertices: new Float32Array([1, 2, 3]),
        indices: new Uint16Array([0, 1, 2]),
      },
    };
  }
}

class MockDevice {
  name = 'MockDevice';

  createBuffer() {
    return { id: 'mock-buffer' };
  }
}

describe('Dependency Injection Container', () => {
  let container: DIContainer;

  beforeEach(() => {
    container = new DIContainer();
  });

  afterEach(() => {
    container.clear();
  });

  describe('Basic Registration and Resolution', () => {
    it('should register and resolve instances', () => {
      const mockService = new MockResourceManager();
      container.registerInstance('test-service', mockService);

      expect(container.has('test-service')).toBe(true);
      expect(container.resolve('test-service')).toBe(mockService);
    });

    it('should register and resolve factories', () => {
      container.register('test-factory', () => new MockResourceManager());

      expect(container.has('test-factory')).toBe(true);
      const instance = container.resolve('test-factory');
      expect(instance).toBeInstanceOf(MockResourceManager);
    });

    it('should register and resolve singletons', () => {
      container.registerSingleton('test-singleton', () => new MockResourceManager());

      const instance1 = container.resolve('test-singleton');
      const instance2 = container.resolve('test-singleton');

      expect(instance1).toBe(instance2); // Same instance
      expect(instance1).toBeInstanceOf(MockResourceManager);
    });

    it('should throw error for unregistered service', () => {
      expect(() => container.resolve('non-existent')).toThrow(
        "Service 'non-existent' not registered in DI container",
      );
    });
  });

  describe('Service Metadata', () => {
    it('should register and retrieve service metadata', () => {
      const metadata = {
        token: 'test-service',
        lifecycle: 'singleton' as const,
        dependencies: ['dep1', 'dep2'],
        metadata: { version: '1.0.0' },
        registeredAt: Date.now(),
      };

      container.registerServiceMetadata('test-service', metadata);

      const retrieved = container.getServiceMetadata('test-service');
      expect(retrieved).toEqual(metadata);
    });

    it('should return undefined for non-existent metadata', () => {
      const retrieved = container.getServiceMetadata('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Auto Registration with Options', () => {
    it('should register singleton with options', () => {
      const mockService = new MockResourceManager();

      container.registerInstanceWithOptions('test-singleton', mockService, {
        lifecycle: 'singleton',
        dependencies: ['dep1'],
        metadata: { version: '1.0.0' },
      });

      expect(container.has('test-singleton')).toBe(true);
      expect(container.resolve('test-singleton')).toBe(mockService);
    });

    it('should skip registration if singleton already exists', () => {
      const mockService1 = new MockResourceManager();
      const mockService2 = new MockResourceManager();

      container.registerInstanceWithOptions('test-singleton', mockService1, {
        lifecycle: 'singleton',
      });

      // Second registration should be skipped
      container.registerInstanceWithOptions('test-singleton', mockService2, {
        lifecycle: 'singleton',
      });

      expect(container.resolve('test-singleton')).toBe(mockService1);
    });

    it('should register transient instances', () => {
      const mockService = new MockResourceManager();

      container.registerInstanceWithOptions('test-transient', mockService, {
        lifecycle: 'transient',
      });

      expect(container.has('test-transient')).toBe(true);
      expect(container.resolve('test-transient')).toBe(mockService);
    });
  });

  describe('Child Container', () => {
    it('should create child container with inherited services', () => {
      const mockService = new MockResourceManager();
      container.registerInstance('parent-service', mockService);

      const child = container.createChild();

      expect(child.has('parent-service')).toBe(true);
      expect(child.resolve('parent-service')).toBe(mockService);
    });

    it('should allow child to override parent services', () => {
      const parentService = new MockResourceManager();
      const childService = new MockGeometryManager();

      container.registerInstance('test-service', parentService);
      const child = container.createChild();
      child.registerInstance('test-service', childService);

      expect(child.resolve('test-service')).toBe(childService);
      expect(container.resolve('test-service')).toBe(parentService);
    });
  });

  describe('Registered Tokens', () => {
    it('should return all registered tokens', () => {
      container.registerInstance('service1', new MockResourceManager());
      container.register('service2', () => new MockGeometryManager());
      container.registerSingleton('service3', () => new MockDevice());

      const tokens = container.getRegisteredTokens();
      expect(tokens).toContain('service1');
      expect(tokens).toContain('service2');
      expect(tokens).toContain('service3');
      expect(tokens).toHaveLength(3);
    });
  });
});

describe('Injectable Decorator', () => {
  beforeEach(() => {
    globalContainer.clear();
  });

  afterEach(() => {
    globalContainer.clear();
  });

  describe('Auto Registration', () => {
    it('should auto-register singleton service', () => {
      @Injectable(ServiceTokens.RESOURCE_MANAGER, { lifecycle: 'singleton' })
      class TestService {
        name = 'TestService';
      }

      const instance1 = new TestService();
      const instance2 = new TestService();

      expect(globalContainer.has(ServiceTokens.RESOURCE_MANAGER)).toBe(true);
      expect(globalContainer.resolve(ServiceTokens.RESOURCE_MANAGER)).toBe(instance1);
      expect(globalContainer.resolve(ServiceTokens.RESOURCE_MANAGER)).toBe(instance1); // Same instance
    });

    it('should auto-register transient service', () => {
      @Injectable(ServiceTokens.GEOMETRY_MANAGER, { lifecycle: 'transient' })
      class TestService {
        name = 'TestService';
      }

      const instance1 = new TestService();
      const instance2 = new TestService();

      expect(globalContainer.has(ServiceTokens.GEOMETRY_MANAGER)).toBe(true);
      // For transient, the last created instance should be registered
      expect(globalContainer.resolve(ServiceTokens.GEOMETRY_MANAGER)).toBe(instance2);
    });

    it('should register service metadata', () => {
      @Injectable(ServiceTokens.BUFFER_MANAGER, {
        lifecycle: 'singleton',
        dependencies: ['dep1', 'dep2'],
        metadata: { version: '1.0.0' },
      })
      class TestService {
        name = 'TestService';
      }

      new TestService();

      const metadata = globalContainer.getServiceMetadata(ServiceTokens.BUFFER_MANAGER);
      expect(metadata).toBeDefined();
      expect(metadata?.token).toBe(ServiceTokens.BUFFER_MANAGER);
      expect(metadata?.lifecycle).toBe('singleton');
      expect(metadata?.dependencies).toEqual(['dep1', 'dep2']);
      expect(metadata?.metadata).toEqual({ version: '1.0.0' });
    });

    it('should work without token (no auto-registration)', () => {
      @Injectable()
      class TestService {
        name = 'TestService';
      }

      const instance = new TestService();
      expect(instance).toBeInstanceOf(TestService);
      // Should not be auto-registered
      expect(globalContainer.getRegisteredTokens()).toHaveLength(0);
    });
  });

  describe('Resource Manager Integration', () => {
    it('should add resource manager methods to prototype', () => {
      @Injectable()
      class TestService {
        name = 'TestService';
      }

      const instance = new TestService();

      expect(typeof (instance as any).setResourceManager).toBe('function');
      expect(typeof (instance as any).getResourceManager).toBe('function');
      expect(typeof (instance as any).generateResourceId).toBe('function');
      expect(typeof (instance as any).registerResource).toBe('function');
    });
  });
});

describe('Inject Decorator', () => {
  beforeEach(() => {
    globalContainer.clear();
    globalContainer.registerInstance(ServiceTokens.RESOURCE_MANAGER, new MockResourceManager());
    globalContainer.registerInstance(ServiceTokens.GEOMETRY_MANAGER, new MockGeometryManager());
  });

  afterEach(() => {
    globalContainer.clear();
  });

  it('should inject dependencies into properties', () => {
    @Injectable()
    class TestClass {
      @Inject(ServiceTokens.RESOURCE_MANAGER)
      resourceManager!: MockResourceManager;

      @Inject(ServiceTokens.GEOMETRY_MANAGER)
      geometryManager!: MockGeometryManager;
    }

    const instance = new TestClass();

    expect(instance.resourceManager).toBeInstanceOf(MockResourceManager);
    expect(instance.geometryManager).toBeInstanceOf(MockGeometryManager);
    expect(instance.resourceManager.test()).toBe('Resource manager working');
    expect(instance.geometryManager.getGeometry('cube')).toBeDefined();
  });

  it('should handle missing dependencies gracefully', () => {
    @Injectable()
    class TestClass {
      @Inject('non-existent-service')
      missingService!: any;
    }

    const instance = new TestClass();

    // Should be undefined and not throw
    expect(instance.missingService).toBeUndefined();
  });

  it('should cache resolved dependencies', () => {
    @Injectable()
    class TestClass {
      @Inject(ServiceTokens.RESOURCE_MANAGER)
      resourceManager!: MockResourceManager;
    }

    const instance = new TestClass();
    const firstAccess = instance.resourceManager;
    const secondAccess = instance.resourceManager;

    expect(firstAccess).toBe(secondAccess);
  });

  it('should allow manual property setting', () => {
    @Injectable()
    class TestClass {
      @Inject(ServiceTokens.RESOURCE_MANAGER)
      resourceManager!: MockResourceManager;
    }

    const instance = new TestClass();
    const customService = new MockGeometryManager();

    // Manual setting should work
    instance.resourceManager = customService as any;
    expect(instance.resourceManager).toBe(customService);
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    globalContainer.clear();
  });

  afterEach(() => {
    globalContainer.clear();
  });

  it('should work with complex dependency chain', () => {
    // Register base services
    globalContainer.registerInstance(ServiceTokens.WEBGPU_DEVICE, new MockDevice());

    @Injectable(ServiceTokens.RESOURCE_MANAGER, { lifecycle: 'singleton' })
    class ResourceManager {
      constructor() {
        console.log('ResourceManager created');
      }
    }

    @Injectable(ServiceTokens.BUFFER_MANAGER, { lifecycle: 'singleton' })
    class BufferManager {
      @Inject(ServiceTokens.RESOURCE_MANAGER)
      resourceManager!: ResourceManager;

      constructor() {
        console.log('BufferManager created');
      }
    }

    @Injectable(ServiceTokens.GEOMETRY_MANAGER, { lifecycle: 'singleton' })
    class GeometryManager {
      @Inject(ServiceTokens.BUFFER_MANAGER)
      bufferManager!: BufferManager;

      constructor() {
        console.log('GeometryManager created');
      }
    }

    // Create instances
    const resourceManager = new ResourceManager();
    const bufferManager = new BufferManager();
    const geometryManager = new GeometryManager();

    // Verify auto-registration
    expect(globalContainer.has(ServiceTokens.RESOURCE_MANAGER)).toBe(true);
    expect(globalContainer.has(ServiceTokens.BUFFER_MANAGER)).toBe(true);
    expect(globalContainer.has(ServiceTokens.GEOMETRY_MANAGER)).toBe(true);

    // Verify dependency injection
    expect(bufferManager.resourceManager).toBe(resourceManager);
    expect(geometryManager.bufferManager).toBe(bufferManager);
  });

  it('should handle singleton lifecycle correctly', () => {
    @Injectable(ServiceTokens.TIME_MANAGER, { lifecycle: 'singleton' })
    class TimeManager {
      id = Math.random();
    }

    const instance1 = new TimeManager();
    const instance2 = new TimeManager();

    // Should be the same instance due to singleton lifecycle
    expect(instance1).toBe(instance2);
    expect(globalContainer.resolve(ServiceTokens.TIME_MANAGER)).toBe(instance1);
  });
});
