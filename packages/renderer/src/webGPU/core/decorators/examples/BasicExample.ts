import { WebGPUResourceManager } from '../../ResourceManager';
import { ResourceType } from '../../types/constant';
import {
  AutoRegisterResource,
  Injectable,
  MonitorPerformance,
  SmartResource,
} from '../ResourceDecorators';

/**
 * Basic example showing how to use decorators
 * This is a simplified version for testing purposes
 */

// Basic injectable class
@Injectable()
class BasicBufferManager {
  constructor(private device: GPUDevice) {}

  // Simple method that will be enhanced by decorators
  createSimpleBuffer(size: number, label: string): GPUBuffer {
    return this.device.createBuffer({
      size: Math.ceil(size / 4) * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label,
    });
  }
}

// Example with auto-registration
@Injectable()
class AutoRegisterBufferManager {
  constructor(private device: GPUDevice) {}

  @AutoRegisterResource(ResourceType.BUFFER, {
    lifecycle: 'persistent',
  })
  createAutoBuffer(size: number, label: string): GPUBuffer {
    return this.device.createBuffer({
      size: Math.ceil(size / 4) * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label,
    });
  }
}

// Example with smart caching
@Injectable()
class SmartCacheManager {
  constructor(private device: GPUDevice) {}

  @SmartResource(ResourceType.BUFFER, {
    cache: true,
    maxCacheSize: 10,
  })
  createCachedBuffer(size: number, label: string): GPUBuffer {
    console.log(`Creating buffer: ${label} (${size} bytes)`);
    return this.device.createBuffer({
      size: Math.ceil(size / 4) * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label,
    });
  }
}

// Example with performance monitoring
@Injectable()
class PerformanceManager {
  constructor(private device: GPUDevice) {}

  @MonitorPerformance()
  @AutoRegisterResource(ResourceType.BUFFER)
  createMonitoredBuffer(size: number, label: string): GPUBuffer {
    // Simulate some work
    const alignedSize = Math.ceil(size / 4) * 4;
    return this.device.createBuffer({
      size: alignedSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label,
    });
  }
}

/**
 * Demo function to show basic usage
 */
export async function demonstrateBasicDecorators(device: GPUDevice): Promise<void> {
  console.log('=== Basic Decorator Demo ===');

  // Create resource manager
  const resourceManager = new WebGPUResourceManager();

  // Test basic injectable
  const basicManager = new BasicBufferManager(device);
  (basicManager as any).setResourceManager(resourceManager);

  console.log(
    'Basic manager has setResourceManager:',
    typeof (basicManager as any).setResourceManager === 'function',
  );

  // Test auto-registration
  const autoManager = new AutoRegisterBufferManager(device);
  (autoManager as any).setResourceManager(resourceManager);

  const autoBuffer = autoManager.createAutoBuffer(1024, 'AutoBuffer');
  console.log('Auto buffer created:', autoBuffer.label);

  // Test smart caching
  const smartManager = new SmartCacheManager(device);
  (smartManager as any).setResourceManager(resourceManager);

  // First call creates buffer
  const cachedBuffer1 = smartManager.createCachedBuffer(512, 'CachedBuffer');
  // Second call should use cache
  const cachedBuffer2 = smartManager.createCachedBuffer(512, 'CachedBuffer');

  console.log('Cached buffers are same:', cachedBuffer1 === cachedBuffer2);

  // Test performance monitoring
  const perfManager = new PerformanceManager(device);
  (perfManager as any).setResourceManager(resourceManager);

  perfManager.createMonitoredBuffer(2048, 'PerfBuffer');

  const metrics = (perfManager as any).getPerformanceMetrics();
  console.log('Performance metrics available:', metrics instanceof Map);

  // Show resource stats
  console.log('Resource stats:', resourceManager.getResourceStats());
}

export { AutoRegisterBufferManager, BasicBufferManager, PerformanceManager, SmartCacheManager };
