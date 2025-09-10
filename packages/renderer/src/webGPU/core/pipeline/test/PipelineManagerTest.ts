/**
 * PipelineManager Test Suite
 *
 * Tests for the PipelineManager class to ensure proper pipeline creation and caching.
 */

import { PipelineManager } from '../PipelineManager';
import { TestConfig } from './index';

// Mock WebGPU device
const mockDevice = {
  createRenderPipeline: jest.fn(() => ({})),
  createPipelineLayout: jest.fn(() => ({})),
  createBindGroupLayout: jest.fn(() => ({})),
  createBindGroup: jest.fn(() => ({})),
  createShaderModule: jest.fn(() => ({})),
  features: new Set(['timestamp-query']),
  limits: TestConfig.mockDeviceLimits,
} as unknown as GPUDevice;

// Mock WebGPU context
const mockContext = {
  getDevice: () => mockDevice,
  getPreferredFormat: () => 'bgra8unorm' as GPUTextureFormat,
} as any;

// Mock resource manager
const mockResourceManager = {
  getBindGroupLayoutResource: jest.fn((id: string) => {
    const layouts: Record<string, any> = {
      timeBindGroupLayout: { layout: {} },
      mvpBindGroupLayout: { layout: {} },
      materialBindGroupLayout: { layout: {} },
    };
    return layouts[id] || null;
  }),
  getBindGroupResource: jest.fn(() => ({ bindGroup: {} })),
} as any;

// Mock shader manager
const mockShaderManager = {
  safeGetShaderModule: jest.fn(() => ({})),
  safeGetBindGroupLayout: jest.fn(() => ({})),
  safeGetBindGroup: jest.fn(() => ({})),
} as any;

/**
 * Test pipeline creation with valid semantic key
 */
export async function testPipelineCreation(): Promise<boolean> {
  try {
    console.log('[PipelineManagerTest] Testing pipeline creation...');

    const pipelineManager = new PipelineManager();

    // Mock dependencies
    (pipelineManager as any).context = mockContext;
    (pipelineManager as any).resourceManager = mockResourceManager;
    (pipelineManager as any).shaderManager = mockShaderManager;

    // Test semantic key
    const semanticKey = {
      material: {
        albedo: { r: 1, g: 0, b: 0, a: 1 },
        metallic: 0.5,
        roughness: 0.5,
        alphaMode: 'opaque' as const,
      },
      geometry: {
        vertexCount: 36,
        hasNormals: true,
        hasUVs: true,
      },
      options: {
        depthTest: true,
        depthWrite: true,
        cullMode: 'back' as const,
      },
    };

    // Create pipeline
    const pipeline = await pipelineManager.getPipeline(semanticKey);

    if (!pipeline) {
      console.error('[PipelineManagerTest] Pipeline creation failed');
      return false;
    }

    console.log('[PipelineManagerTest] Pipeline created successfully');
    return true;
  } catch (error) {
    console.error('[PipelineManagerTest] Pipeline creation test failed:', error);
    return false;
  }
}

/**
 * Test pipeline caching
 */
export async function testPipelineCaching(): Promise<boolean> {
  try {
    console.log('[PipelineManagerTest] Testing pipeline caching...');

    const pipelineManager = new PipelineManager();

    // Mock dependencies
    (pipelineManager as any).context = mockContext;
    (pipelineManager as any).resourceManager = mockResourceManager;
    (pipelineManager as any).shaderManager = mockShaderManager;

    const semanticKey = {
      material: {
        albedo: { r: 0, g: 1, b: 0, a: 1 },
        metallic: 0.3,
        roughness: 0.7,
        alphaMode: 'opaque' as const,
      },
      geometry: {
        vertexCount: 24,
        hasNormals: false,
        hasUVs: true,
      },
      options: {
        depthTest: true,
        depthWrite: false,
        cullMode: 'none' as const,
      },
    };

    // Create pipeline twice
    const pipeline1 = await pipelineManager.getPipeline(semanticKey);
    const pipeline2 = await pipelineManager.getPipeline(semanticKey);

    if (pipeline1 !== pipeline2) {
      console.error('[PipelineManagerTest] Pipeline caching failed - different instances returned');
      return false;
    }

    // Check cache stats
    const stats = pipelineManager.getCacheStats();
    if (stats.semantic.hitCount === 0) {
      console.error('[PipelineManagerTest] Cache hit count should be > 0');
      return false;
    }

    console.log('[PipelineManagerTest] Pipeline caching working correctly');
    return true;
  } catch (error) {
    console.error('[PipelineManagerTest] Pipeline caching test failed:', error);
    return false;
  }
}

/**
 * Test cache management
 */
export async function testCacheManagement(): Promise<boolean> {
  try {
    console.log('[PipelineManagerTest] Testing cache management...');

    const pipelineManager = new PipelineManager();

    // Mock dependencies
    (pipelineManager as any).context = mockContext;
    (pipelineManager as any).resourceManager = mockResourceManager;
    (pipelineManager as any).shaderManager = mockShaderManager;

    // Test cache clearing
    pipelineManager.clearCache();

    const statsAfterClear = pipelineManager.getCacheStats();
    if (statsAfterClear.semantic.size !== 0 || statsAfterClear.gpu.size !== 0) {
      console.error('[PipelineManagerTest] Cache clear failed');
      return false;
    }

    // Test cache size limit
    pipelineManager.setMaxCacheSize(2);

    // Create more pipelines than cache limit
    for (let i = 0; i < 5; i++) {
      const semanticKey = {
        material: {
          albedo: { r: i / 5, g: 0, b: 0, a: 1 },
          metallic: 0.5,
          roughness: 0.5,
          alphaMode: 'opaque' as const,
        },
        geometry: {
          vertexCount: 36,
          hasNormals: true,
          hasUVs: true,
        },
        options: {
          depthTest: true,
          depthWrite: true,
          cullMode: 'back' as const,
        },
      };

      await pipelineManager.getPipeline(semanticKey);
    }

    const statsAfterOverflow = pipelineManager.getCacheStats();
    if (statsAfterOverflow.semantic.size > 2) {
      console.error('[PipelineManagerTest] Cache size limit not enforced');
      return false;
    }

    console.log('[PipelineManagerTest] Cache management working correctly');
    return true;
  } catch (error) {
    console.error('[PipelineManagerTest] Cache management test failed:', error);
    return false;
  }
}

/**
 * Run all PipelineManager tests
 */
export async function runPipelineManagerTests(): Promise<void> {
  console.log('🧪 Running PipelineManager tests...');

  const tests = [
    { name: 'Pipeline Creation', fn: testPipelineCreation },
    { name: 'Pipeline Caching', fn: testPipelineCaching },
    { name: 'Cache Management', fn: testCacheManagement },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name} passed`);
        passed++;
      } else {
        console.log(`❌ ${test.name} failed`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} failed with error:`, error);
      failed++;
    }
  }

  console.log(`📊 PipelineManager tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    throw new Error(`${failed} PipelineManager tests failed`);
  }
}
