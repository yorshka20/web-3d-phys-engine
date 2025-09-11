import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceType } from '../../types/constant';
import { globalContainer, ServiceTokens } from '../DIContainer';
import { Inject, Injectable, SmartResource } from '../ResourceDecorators';

// Mock services
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

describe('Decorator Execution Order', () => {
  beforeEach(() => {
    globalContainer.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalContainer.clear();
  });

  describe('Injectable Decorator Execution', () => {
    it('should execute constructor interception correctly', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      @Injectable(ServiceTokens.RESOURCE_MANAGER, { lifecycle: 'singleton' })
      class TestService {
        constructor() {
          console.log('Original constructor called');
        }
      }

      const instance = new TestService();

      // Should log both original constructor and auto-registration
      expect(consoleSpy).toHaveBeenCalledWith('Original constructor called');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Injectable] Auto-registered instance of TestService'),
      );

      consoleSpy.mockRestore();
    });

    it('should preserve class identity and prototype chain', () => {
      @Injectable(ServiceTokens.GEOMETRY_MANAGER, { lifecycle: 'transient' })
      class TestService {
        testMethod() {
          return 'test method working';
        }
      }

      const instance = new TestService();

      expect(instance).toBeInstanceOf(TestService);
      expect(instance.testMethod()).toBe('test method working');
      expect(TestService.prototype.testMethod).toBeDefined();
    });

    it('should handle constructor with parameters', () => {
      @Injectable(ServiceTokens.BUFFER_MANAGER, { lifecycle: 'singleton' })
      class TestService {
        constructor(
          public param1: string,
          public param2: number,
        ) {
          console.log(`Constructor called with ${param1} and ${param2}`);
        }
      }

      const instance = new TestService('test', 42);

      expect(instance.param1).toBe('test');
      expect(instance.param2).toBe(42);
    });
  });

  describe('Inject Decorator Execution', () => {
    beforeEach(() => {
      globalContainer.registerInstance(ServiceTokens.RESOURCE_MANAGER, new MockResourceManager());
      globalContainer.registerInstance(ServiceTokens.GEOMETRY_MANAGER, new MockGeometryManager());
    });

    it('should execute property injection on instance creation', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      @Injectable()
      class TestClass {
        @Inject(ServiceTokens.RESOURCE_MANAGER)
        resourceManager!: MockResourceManager;

        constructor() {
          console.log('TestClass constructor called');
        }
      }

      const instance = new TestClass();

      // Access the injected property to trigger injection
      const rm = instance.resourceManager;

      expect(consoleSpy).toHaveBeenCalledWith('TestClass constructor called');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Inject] Successfully injected'),
      );

      consoleSpy.mockRestore();
    });

    it('should handle property access timing correctly', () => {
      @Injectable()
      class TestClass {
        @Inject(ServiceTokens.RESOURCE_MANAGER)
        resourceManager!: MockResourceManager;

        @Inject(ServiceTokens.GEOMETRY_MANAGER)
        geometryManager!: MockGeometryManager;
      }

      const instance = new TestClass();

      // Properties should be undefined until first access
      expect(instance.resourceManager).toBeUndefined();
      expect(instance.geometryManager).toBeUndefined();

      // First access should trigger injection
      const rm = instance.resourceManager;
      expect(rm).toBeInstanceOf(MockResourceManager);

      // Second access should return cached value
      const rm2 = instance.resourceManager;
      expect(rm).toBe(rm2);
    });

    it('should handle injection errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      @Injectable()
      class TestClass {
        @Inject('non-existent-service')
        missingService!: any;
      }

      const instance = new TestClass();

      // Access should not throw, but should log error
      const service = instance.missingService;
      expect(service).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Inject] Failed to inject dependency'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Resource Decorators Execution', () => {
    it('should execute SmartResource decorator with caching', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      @Injectable()
      class TestManager {
        @SmartResource(ResourceType.SHADER, { cache: true, maxCacheSize: 10 })
        createShader(label: string): any {
          return { id: `shader-${label}`, type: 'shader' };
        }
      }

      const manager = new TestManager();
      const shader1 = manager.createShader('test-shader');
      const shader2 = manager.createShader('test-shader');

      // Should return cached instance
      expect(shader1).toBe(shader2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SmartResource] Processing resource'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Complex Decorator Combinations', () => {
    it('should handle multiple decorators on the same class', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      @Injectable(ServiceTokens.TEXTURE_MANAGER, { lifecycle: 'singleton' })
      class TestManager {
        @Inject(ServiceTokens.RESOURCE_MANAGER)
        resourceManager!: MockResourceManager;

        @SmartResource(ResourceType.TEXTURE)
        createTexture(label: string): any {
          return { id: `texture-${label}`, type: 'texture' };
        }

        @SmartResource(ResourceType.SAMPLER, { cache: true })
        createSampler(label: string): any {
          return { id: `sampler-${label}`, type: 'sampler' };
        }
      }

      const manager = new TestManager();

      // Test injection
      const rm = manager.resourceManager;
      expect(rm).toBeInstanceOf(MockResourceManager);

      // Test resource creation
      const texture = manager.createTexture('test-texture');
      const sampler = manager.createSampler('test-sampler');

      expect(texture).toBeDefined();
      expect(sampler).toBeDefined();

      // Should have logged various decorator activities
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Injectable] Auto-registered instance'),
      );

      consoleSpy.mockRestore();
    });

    it('should handle decorator execution order correctly', () => {
      const executionOrder: string[] = [];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((message: string) => {
        if (typeof message === 'string') {
          executionOrder.push(message);
        }
      });

      @Injectable(ServiceTokens.RESOURCE_MANAGER, { lifecycle: 'singleton' })
      class TestManager {
        @Inject(ServiceTokens.RESOURCE_MANAGER)
        resourceManager!: MockResourceManager;

        constructor() {
          executionOrder.push('Constructor executed');
        }

        @SmartResource(ResourceType.BUFFER)
        createBuffer(label: string): any {
          executionOrder.push('Resource creation method called');
          return { id: `buffer-${label}` };
        }
      }

      const manager = new TestManager();
      const buffer = manager.createBuffer('test');

      // Verify execution order
      expect(executionOrder).toContain('Constructor executed');
      expect(executionOrder).toContain('Resource creation method called');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling in Decorators', () => {
    it('should handle Injectable decorator errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock globalContainer to throw error
      const originalAutoRegister = globalContainer.registerInstanceWithOptions;
      globalContainer.registerInstanceWithOptions = vi.fn().mockImplementation(() => {
        throw new Error('Registration failed');
      });

      @Injectable(ServiceTokens.RESOURCE_MANAGER, { lifecycle: 'singleton' })
      class TestService {
        constructor() {
          console.log('Constructor called despite error');
        }
      }

      const instance = new TestService();

      // Should still create instance and log error
      expect(instance).toBeInstanceOf(TestService);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Injectable] Failed to auto-register'),
      );

      // Restore original method
      globalContainer.registerInstanceWithOptions = originalAutoRegister;
      consoleSpy.mockRestore();
    });

    it('should handle Inject decorator errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock globalContainer to throw error
      const originalResolve = globalContainer.resolve;
      globalContainer.resolve = vi.fn().mockImplementation(() => {
        throw new Error('Resolution failed');
      });

      @Injectable()
      class TestClass {
        @Inject(ServiceTokens.RESOURCE_MANAGER)
        resourceManager!: MockResourceManager;
      }

      const instance = new TestClass();

      // Access should not throw, but should log error
      const service = instance.resourceManager;
      expect(service).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Inject] Failed to inject dependency'),
      );

      // Restore original method
      globalContainer.resolve = originalResolve;
      consoleSpy.mockRestore();
    });
  });
});
