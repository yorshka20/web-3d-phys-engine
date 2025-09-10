/**
 * Pipeline Test Suite
 *
 * Centralized test management for the WebGPU pipeline system.
 * This module provides a unified interface for running all pipeline-related tests.
 */

// export * from './PipelineFactoryTest';
// export * from './PipelineManagerTest';
export * from './ResourcePreparationTest';

/**
 * Run all pipeline tests
 */
export async function runAllPipelineTests(): Promise<void> {
  console.log('🧪 Running all pipeline tests...');

  try {
    // Import and run resource preparation tests
    const { runResourcePreparationTests } = await import('./ResourcePreparationTest');
    await runResourcePreparationTests();

    // Import and run pipeline manager tests
    // const { runPipelineManagerTests } = await import('./PipelineManagerTest');
    // await runPipelineManagerTests();

    // Import and run pipeline factory tests
    // const { runPipelineFactoryTests } = await import('./PipelineFactoryTest');
    // await runPipelineFactoryTests();

    console.log('✅ All pipeline tests completed successfully!');
  } catch (error) {
    console.error('❌ Pipeline tests failed:', error);
    throw error;
  }
}

/**
 * Test configuration
 */
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
