import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { globalContainer, ServiceTokens } from '../DIContainer';
import { Inject, Injectable, MonitorPerformance } from '../ResourceDecorators';

// Mock services for performance testing
class MockService {
  id = Math.random();

  process() {
    return 'processed';
  }
}

class MockHeavyService {
  id = Math.random();

  @MonitorPerformance({ logThreshold: 0.1, enableLogging: false })
  heavyOperation() {
    // Simulate heavy operation
    const start = performance.now();
    while (performance.now() - start < 1) {
      // Busy wait for 1ms
    }
    return 'heavy operation completed';
  }

  @MonitorPerformance({ logThreshold: 0.1, enableLogging: false })
  quickOperation() {
    return 'quick operation completed';
  }
}

describe('Performance Tests', () => {
  beforeEach(() => {
    globalContainer.clear();
  });

  afterEach(() => {
    globalContainer.clear();
  });

  describe('Decorator Performance Impact', () => {
    it('should measure Injectable decorator overhead', () => {
      const iterations = 1000;

      // Test without decorator
      class PlainClass {
        constructor() {}
      }

      const startPlain = performance.now();
      for (let i = 0; i < iterations; i++) {
        new PlainClass();
      }
      const endPlain = performance.now();
      const plainTime = endPlain - startPlain;

      // Test with Injectable decorator
      @Injectable()
      class DecoratedClass {
        constructor() {}
      }

      const startDecorated = performance.now();
      for (let i = 0; i < iterations; i++) {
        new DecoratedClass();
      }
      const endDecorated = performance.now();
      const decoratedTime = endDecorated - startDecorated;

      // Decorated version should not be more than 2x slower
      expect(decoratedTime).toBeLessThan(plainTime * 2);

      console.log(`Plain class: ${plainTime.toFixed(2)}ms`);
      console.log(`Decorated class: ${decoratedTime.toFixed(2)}ms`);
      console.log(`Overhead: ${((decoratedTime / plainTime - 1) * 100).toFixed(1)}%`);
    });

    it('should measure Inject decorator overhead', () => {
      globalContainer.registerInstance(ServiceTokens.RESOURCE_MANAGER, new MockService());

      const iterations = 1000;

      @Injectable()
      class TestClass {
        @Inject(ServiceTokens.RESOURCE_MANAGER)
        service!: MockService;
      }

      const instances: TestClass[] = [];
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const instance = new TestClass();
        // Access property to trigger injection
        const service = instance.service;
        instances.push(instance);
      }

      const end = performance.now();
      const totalTime = end - start;
      const avgTime = totalTime / iterations;

      // Average time per instance should be reasonable
      expect(avgTime).toBeLessThan(1); // Less than 1ms per instance

      console.log(`Total time for ${iterations} instances: ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per instance: ${avgTime.toFixed(3)}ms`);
    });

    it('should measure auto-registration overhead', () => {
      const iterations = 100;

      @Injectable(ServiceTokens.RESOURCE_MANAGER, { lifecycle: 'transient' })
      class TestService {
        id = Math.random();
      }

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        new TestService();
      }

      const end = performance.now();
      const totalTime = end - start;
      const avgTime = totalTime / iterations;

      // Average time should be reasonable
      expect(avgTime).toBeLessThan(2); // Less than 2ms per instance

      console.log(`Auto-registration time for ${iterations} instances: ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per instance: ${avgTime.toFixed(3)}ms`);
    });
  });

  describe('Container Performance', () => {
    it('should measure container resolution performance', () => {
      const iterations = 10000;

      // Register many services
      for (let i = 0; i < 100; i++) {
        globalContainer.registerInstance(`service-${i}`, new MockService());
      }

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const service = globalContainer.resolve(`service-${i % 100}`);
        expect(service).toBeDefined();
      }

      const end = performance.now();
      const totalTime = end - start;
      const avgTime = totalTime / iterations;

      // Resolution should be very fast
      expect(avgTime).toBeLessThan(0.1); // Less than 0.1ms per resolution

      console.log(`Container resolution time for ${iterations} calls: ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per resolution: ${avgTime.toFixed(4)}ms`);
    });

    it('should measure singleton vs transient performance', () => {
      const iterations = 1000;

      // Test singleton
      globalContainer.registerSingleton('singleton-service', () => new MockService());

      const startSingleton = performance.now();
      for (let i = 0; i < iterations; i++) {
        globalContainer.resolve('singleton-service');
      }
      const endSingleton = performance.now();
      const singletonTime = endSingleton - startSingleton;

      // Test transient (factory)
      globalContainer.register('transient-service', () => new MockService());

      const startTransient = performance.now();
      for (let i = 0; i < iterations; i++) {
        globalContainer.resolve('transient-service');
      }
      const endTransient = performance.now();
      const transientTime = endTransient - startTransient;

      // Singleton should be faster (no object creation)
      expect(singletonTime).toBeLessThan(transientTime);

      console.log(`Singleton resolution time: ${singletonTime.toFixed(2)}ms`);
      console.log(`Transient resolution time: ${transientTime.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with repeated instantiation', () => {
      const iterations = 1000;

      @Injectable(ServiceTokens.RESOURCE_MANAGER, { lifecycle: 'transient' })
      class TestService {
        data = new Array(1000).fill(0).map((_, i) => i);
      }

      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

      for (let i = 0; i < iterations; i++) {
        const service = new TestService();
        // Access to ensure injection happens
        expect(service.data).toBeDefined();
      }

      // Force garbage collection if available
      if ((global as any).gc) {
        (global as any).gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;

      if (initialMemory > 0 && finalMemory > 0) {
        const memoryIncrease = finalMemory - initialMemory;
        const memoryPerInstance = memoryIncrease / iterations;

        // Memory increase should be reasonable
        expect(memoryPerInstance).toBeLessThan(10000); // Less than 10KB per instance

        console.log(`Memory increase: ${(memoryIncrease / 1024).toFixed(2)}KB`);
        console.log(`Memory per instance: ${(memoryPerInstance / 1024).toFixed(2)}KB`);
      }
    });

    it('should handle large number of registered services efficiently', () => {
      const serviceCount = 10000;

      // Register many services
      const start = performance.now();
      for (let i = 0; i < serviceCount; i++) {
        globalContainer.registerInstance(`service-${i}`, new MockService());
      }
      const end = performance.now();

      const registrationTime = end - start;
      const avgRegistrationTime = registrationTime / serviceCount;

      // Registration should be fast
      expect(avgRegistrationTime).toBeLessThan(0.1); // Less than 0.1ms per registration

      // Test resolution performance
      const resolutionStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        const service = globalContainer.resolve(`service-${i % serviceCount}`);
        expect(service).toBeDefined();
      }
      const resolutionEnd = performance.now();

      const resolutionTime = resolutionEnd - resolutionStart;
      const avgResolutionTime = resolutionTime / 1000;

      // Resolution should still be fast even with many services
      expect(avgResolutionTime).toBeLessThan(0.1);

      console.log(`Registered ${serviceCount} services in ${registrationTime.toFixed(2)}ms`);
      console.log(`Average registration time: ${avgRegistrationTime.toFixed(4)}ms`);
      console.log(`Average resolution time: ${avgResolutionTime.toFixed(4)}ms`);
    });
  });

  describe('MonitorPerformance Decorator', () => {
    it('should track performance metrics correctly', () => {
      @Injectable()
      class TestManager {
        @MonitorPerformance({ logThreshold: 0.1, enableLogging: false })
        testMethod() {
          return 'test result';
        }
      }

      const manager = new TestManager();

      // Call method multiple times
      for (let i = 0; i < 10; i++) {
        manager.testMethod();
      }

      // Check if performance metrics were collected
      const metrics = (manager as any).getPerformanceMetrics?.();
      expect(metrics).toBeDefined();
      expect(metrics?.has('testMethod')).toBe(true);

      const methodMetrics = metrics?.get('testMethod');
      expect(methodMetrics).toBeDefined();
      expect(methodMetrics?.length).toBe(10);

      // Check performance stats
      const stats = (manager as any).getPerformanceStats?.('testMethod');
      expect(stats).toBeDefined();
      expect(stats?.count).toBe(10);
      expect(stats?.average).toBeGreaterThan(0);
    });

    it('should maintain max samples limit', () => {
      @Injectable()
      class TestManager {
        getPerformanceMetrics() {
          throw new Error('Method not implemented.');
        }
        @MonitorPerformance({ maxSamples: 5, enableLogging: false })
        testMethod() {
          return 'test result';
        }
      }

      const manager = new TestManager();

      // Call method more times than max samples
      for (let i = 0; i < 10; i++) {
        manager.testMethod();
      }

      const metrics = (manager as any).getPerformanceMetrics?.();
      const methodMetrics = metrics?.get('testMethod');

      // Should only keep the last 5 samples
      expect(methodMetrics?.length).toBe(5);
    });
  });
});
