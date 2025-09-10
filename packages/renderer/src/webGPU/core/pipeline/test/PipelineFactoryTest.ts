/**
 * PipelineFactory Test Suite
 *
 * Tests for the PipelineFactory class to ensure proper pipeline creation and predefined configurations.
 */

import { PipelineFactory } from '../PipelineFactory';

// Mock dependencies
const mockPipelineManager = {
  getPipeline: jest.fn(() => Promise.resolve({})),
  getCacheStats: jest.fn(() => ({
    semantic: { size: 0, hitCount: 0, missCount: 0, hitRate: 0 },
    gpu: { size: 0, hitCount: 0, missCount: 0, hitRate: 0 },
    mapping: { size: 0 },
  })),
  clearCache: jest.fn(),
} as any;

const mockShaderManager = {} as any;
const mockContext = {
  getPreferredFormat: () => 'bgra8unorm' as GPUTextureFormat,
} as any;

const mockResourceManager = {} as any;

/**
 * Test basic pipeline creation
 */
export async function testBasicPipelineCreation(): Promise<boolean> {
  try {
    console.log('[PipelineFactoryTest] Testing basic pipeline creation...');

    const factory = new PipelineFactory();

    // Mock dependencies
    (factory as any).pipelineManager = mockPipelineManager;
    (factory as any).shaderManager = mockShaderManager;
    (factory as any).context = mockContext;
    (factory as any).resourceManager = mockResourceManager;

    const material = {
      albedo: { r: 1, g: 0, b: 0, a: 1 },
      metallic: 0.5,
      roughness: 0.5,
      alphaMode: 'opaque' as const,
    };

    const geometry = {
      vertexCount: 36,
      hasNormals: true,
      hasUVs: true,
    };

    // Test auto pipeline creation
    const pipeline = await factory.createAutoPipeline(material, geometry);

    if (!pipeline) {
      console.error('[PipelineFactoryTest] Auto pipeline creation failed');
      return false;
    }

    // Verify pipeline manager was called
    expect(mockPipelineManager.getPipeline).toHaveBeenCalled();

    console.log('[PipelineFactoryTest] Basic pipeline creation successful');
    return true;
  } catch (error) {
    console.error('[PipelineFactoryTest] Basic pipeline creation test failed:', error);
    return false;
  }
}

/**
 * Test predefined pipeline configurations
 */
export async function testPredefinedConfigurations(): Promise<boolean> {
  try {
    console.log('[PipelineFactoryTest] Testing predefined configurations...');

    const factory = new PipelineFactory();

    // Mock dependencies
    (factory as any).pipelineManager = mockPipelineManager;
    (factory as any).shaderManager = mockShaderManager;
    (factory as any).context = mockContext;
    (factory as any).resourceManager = mockResourceManager;

    const material = {
      albedo: { r: 0, g: 1, b: 0, a: 1 },
      metallic: 0.3,
      roughness: 0.7,
      alphaMode: 'opaque' as const,
    };

    const geometry = {
      vertexCount: 24,
      hasNormals: true,
      hasUVs: true,
    };

    // Test predefined configurations
    const configs = [
      'standard_opaque',
      'standard_transparent',
      'high_quality',
      'performance',
      'debug',
    ];

    for (const configName of configs) {
      const pipeline = await factory.createPredefinedPipeline(configName, material, geometry);

      if (!pipeline) {
        console.error(`[PipelineFactoryTest] Predefined pipeline '${configName}' creation failed`);
        return false;
      }
    }

    console.log('[PipelineFactoryTest] All predefined configurations working');
    return true;
  } catch (error) {
    console.error('[PipelineFactoryTest] Predefined configurations test failed:', error);
    return false;
  }
}

/**
 * Test specialized pipeline creation
 */
export async function testSpecializedPipelines(): Promise<boolean> {
  try {
    console.log('[PipelineFactoryTest] Testing specialized pipelines...');

    const factory = new PipelineFactory();

    // Mock dependencies
    (factory as any).pipelineManager = mockPipelineManager;
    (factory as any).shaderManager = mockShaderManager;
    (factory as any).context = mockContext;
    (factory as any).resourceManager = mockResourceManager;

    const material = {
      albedo: { r: 0, g: 0, b: 1, a: 0.8 },
      metallic: 0.1,
      roughness: 0.9,
      alphaMode: 'blend' as const,
    };

    const geometry = {
      vertexCount: 12,
      hasNormals: false,
      hasUVs: false,
    };

    // Test specialized pipeline types
    const specializedPipelines = [
      { name: 'Opaque', fn: () => factory.createOpaquePipeline(material, geometry) },
      { name: 'Transparent', fn: () => factory.createTransparentPipeline(material, geometry) },
      { name: 'Wireframe', fn: () => factory.createWireframePipeline(material, geometry) },
      { name: 'Shadow', fn: () => factory.createShadowPipeline(material, geometry) },
      { name: 'UI', fn: () => factory.createUIPipeline(material, geometry) },
      { name: 'PostProcess', fn: () => factory.createPostProcessPipeline(material, geometry) },
    ];

    for (const { name, fn } of specializedPipelines) {
      const pipeline = await fn();

      if (!pipeline) {
        console.error(`[PipelineFactoryTest] ${name} pipeline creation failed`);
        return false;
      }
    }

    console.log('[PipelineFactoryTest] All specialized pipelines working');
    return true;
  } catch (error) {
    console.error('[PipelineFactoryTest] Specialized pipelines test failed:', error);
    return false;
  }
}

/**
 * Test batch pipeline creation
 */
export async function testBatchPipelineCreation(): Promise<boolean> {
  try {
    console.log('[PipelineFactoryTest] Testing batch pipeline creation...');

    const factory = new PipelineFactory();

    // Mock dependencies
    (factory as any).pipelineManager = mockPipelineManager;
    (factory as any).shaderManager = mockShaderManager;
    (factory as any).context = mockContext;
    (factory as any).resourceManager = mockResourceManager;

    const requests = [
      {
        material: {
          albedo: { r: 1, g: 0, b: 0, a: 1 },
          metallic: 0.5,
          roughness: 0.5,
          alphaMode: 'opaque' as const,
        },
        geometry: { vertexCount: 36, hasNormals: true, hasUVs: true },
        purpose: 'auto' as const,
      },
      {
        material: {
          albedo: { r: 0, g: 1, b: 0, a: 1 },
          metallic: 0.3,
          roughness: 0.7,
          alphaMode: 'opaque' as const,
        },
        geometry: { vertexCount: 24, hasNormals: false, hasUVs: true },
        purpose: 'auto' as const,
      },
      {
        material: {
          albedo: { r: 0, g: 0, b: 1, a: 0.8 },
          metallic: 0.1,
          roughness: 0.9,
          alphaMode: 'blend' as const,
        },
        geometry: { vertexCount: 12, hasNormals: true, hasUVs: false },
        purpose: 'auto' as const,
      },
    ];

    const results = await factory.batchCreatePipelines(requests);

    if (results.size !== requests.length) {
      console.error('[PipelineFactoryTest] Batch creation returned wrong number of pipelines');
      return false;
    }

    // Verify all pipelines were created
    for (const [key, pipeline] of results) {
      if (!pipeline) {
        console.error(`[PipelineFactoryTest] Pipeline '${key}' creation failed in batch`);
        return false;
      }
    }

    console.log('[PipelineFactoryTest] Batch pipeline creation successful');
    return true;
  } catch (error) {
    console.error('[PipelineFactoryTest] Batch pipeline creation test failed:', error);
    return false;
  }
}

/**
 * Test configuration management
 */
export async function testConfigurationManagement(): Promise<boolean> {
  try {
    console.log('[PipelineFactoryTest] Testing configuration management...');

    const factory = new PipelineFactory();

    // Mock dependencies
    (factory as any).pipelineManager = mockPipelineManager;
    (factory as any).shaderManager = mockShaderManager;
    (factory as any).context = mockContext;
    (factory as any).resourceManager = mockResourceManager;

    // Test getting predefined config names
    const configNames = factory.getPredefinedConfigNames();

    if (!Array.isArray(configNames) || configNames.length === 0) {
      console.error('[PipelineFactoryTest] No predefined configurations found');
      return false;
    }

    // Test getting specific configuration
    const config = factory.getPredefinedConfig('standard_opaque');

    if (!config) {
      console.error('[PipelineFactoryTest] Standard opaque configuration not found');
      return false;
    }

    // Test registering new configuration
    const newConfig = {
      name: 'test_config',
      description: 'Test configuration',
      options: {
        depthTest: true,
        depthWrite: true,
        cullMode: 'back' as const,
      },
    };

    factory.registerPredefinedConfig(newConfig);

    const retrievedConfig = factory.getPredefinedConfig('test_config');

    if (!retrievedConfig || retrievedConfig.name !== 'test_config') {
      console.error('[PipelineFactoryTest] New configuration registration failed');
      return false;
    }

    console.log('[PipelineFactoryTest] Configuration management working');
    return true;
  } catch (error) {
    console.error('[PipelineFactoryTest] Configuration management test failed:', error);
    return false;
  }
}

/**
 * Run all PipelineFactory tests
 */
export async function runPipelineFactoryTests(): Promise<void> {
  console.log('🧪 Running PipelineFactory tests...');

  const tests = [
    { name: 'Basic Pipeline Creation', fn: testBasicPipelineCreation },
    { name: 'Predefined Configurations', fn: testPredefinedConfigurations },
    { name: 'Specialized Pipelines', fn: testSpecializedPipelines },
    { name: 'Batch Pipeline Creation', fn: testBatchPipelineCreation },
    { name: 'Configuration Management', fn: testConfigurationManagement },
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

  console.log(`📊 PipelineFactory tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    throw new Error(`${failed} PipelineFactory tests failed`);
  }
}
