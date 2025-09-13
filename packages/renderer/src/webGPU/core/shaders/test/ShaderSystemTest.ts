import { ShaderCompiler } from '../../ShaderCompiler';
import { ShaderManager } from '../../ShaderManager';
import { createPMXMaterialShaderModule } from '../create';

/**
 * Test suite for the new shader system
 * This file demonstrates and validates the new shader architecture
 */
export class ShaderSystemTest {
  private shaderManager: ShaderManager;
  private shaderCompiler: ShaderCompiler;

  constructor(shaderManager: ShaderManager, shaderCompiler: ShaderCompiler) {
    this.shaderManager = shaderManager;
    this.shaderCompiler = shaderCompiler;
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<boolean> {
    console.log('🧪 Starting Shader System Tests...\n');

    const tests = [
      () => this.testShaderModuleRegistration(),
      () => this.testShaderCompilation(),
      () => this.testIncludeResolution(),
      () => this.testMacroProcessing(),
      () => this.testPipelineCreation(),
      () => this.testHotReload(),
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        const result = await test();
        if (result) {
          console.log('✅ Test passed');
          passed++;
        } else {
          console.log('❌ Test failed');
          failed++;
        }
      } catch (error) {
        console.log('❌ Test failed with error:', error);
        failed++;
      }
      console.log('');
    }

    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    return failed === 0;
  }

  /**
   * Test shader module registration
   */
  private async testShaderModuleRegistration(): Promise<boolean> {
    console.log('🔧 Testing shader module registration...');

    // Register PMX material shader
    this.shaderManager.registerShaderModule(createPMXMaterialShaderModule());

    // Verify registration
    const module = this.shaderManager.getShaderModuleById('pmx_material_shader');
    if (!module) {
      console.log('❌ Failed to register shader module');
      return false;
    }

    // Verify module properties
    if (module.id !== 'pmx_material_shader') {
      console.log('❌ Incorrect module ID');
      return false;
    }

    if (module.sourceFile !== '/shaders/materials/PMXMaterial.wgsl') {
      console.log('❌ Incorrect source file path');
      return false;
    }

    console.log('✅ Shader module registered successfully');
    return true;
  }

  /**
   * Test shader compilation
   */
  private async testShaderCompilation(): Promise<boolean> {
    console.log('⚙️ Testing shader compilation...');

    const result = await this.shaderManager.compileShaderModule('pmx_material_shader', {
      defines: {
        ENABLE_TOON_SHADING: true,
        ENABLE_NORMAL_MAPPING: true,
      },
      vertexFormat: 'pmx',
    });

    if (!result.success) {
      console.log('❌ Compilation failed:', result.errors);
      return false;
    }

    if (!result.compiledShader) {
      console.log('❌ No compiled shader returned');
      return false;
    }

    // Verify compiled shader properties
    if (result.compiledShader.id !== 'pmx_material_shader') {
      console.log('❌ Incorrect compiled shader ID');
      return false;
    }

    if (!result.compiledShader.sourceCode) {
      console.log('❌ Missing source code');
      return false;
    }

    if (!result.compiledShader.shaderModule) {
      console.log('❌ Missing shader module');
      return false;
    }

    console.log('✅ Shader compiled successfully');
    console.log(
      `   Compilation time: ${result.compiledShader.metadata.compilationTime.toFixed(2)}ms`,
    );
    return true;
  }

  /**
   * Test include resolution
   */
  private async testIncludeResolution(): Promise<boolean> {
    console.log('📁 Testing include resolution...');

    try {
      // Test getting fragment content from registry
      const structsContent = this.shaderCompiler.getFragmentContent('/shaders/common/structs.wgsl');
      if (!structsContent || !structsContent.includes('struct')) {
        console.log('❌ Failed to get structs.wgsl from registry');
        return false;
      }

      const bindingsContent = this.shaderCompiler.getFragmentContent(
        '/shaders/common/bindings.wgsl',
      );
      if (!bindingsContent || !bindingsContent.includes('@group(0) @binding(0)')) {
        console.log('❌ Failed to get bindings.wgsl from registry');
        return false;
      }

      console.log('✅ Include resolution working correctly');
      return true;
    } catch (error) {
      console.log('❌ Include resolution failed:', error);
      return false;
    }
  }

  /**
   * Test macro processing
   */
  private async testMacroProcessing(): Promise<boolean> {
    console.log('🔀 Testing macro processing...');

    // Test macro processing through existing shader compilation
    // Use the PMX material shader which supports various defines
    const enabledResult = this.shaderManager.compileShaderModule('pmx_material_shader', {
      defines: {
        ENABLE_TOON_SHADING: true,
        ENABLE_NORMAL_MAPPING: true,
      },
    });

    if (!enabledResult.success) {
      console.log('❌ Failed to compile with enabled macros');
      return false;
    }

    const disabledResult = this.shaderManager.compileShaderModule('pmx_material_shader', {
      defines: {
        ENABLE_TOON_SHADING: false,
        ENABLE_NORMAL_MAPPING: false,
      },
    });

    if (!disabledResult.success) {
      console.log('❌ Failed to compile with disabled macros');
      return false;
    }

    console.log('✅ Macro processing working correctly');
    return true;
  }

  /**
   * Test pipeline creation
   */
  private async testPipelineCreation(): Promise<boolean> {
    console.log('🔧 Testing pipeline creation...');

    // First compile the shader
    const compileResult = await this.shaderManager.compileShaderModule('pmx_material_shader');
    if (!compileResult.success) {
      console.log('❌ Failed to compile shader for pipeline test');
      return false;
    }

    // Get the compiled shader
    const compiledShader = this.shaderManager.getCompiledShader('pmx_material_shader');
    if (!compiledShader) {
      console.log('❌ Failed to get compiled shader');
      return false;
    }

    // Verify the shader module exists
    if (!compiledShader.shaderModule) {
      console.log('❌ Compiled shader has no shader module');
      return false;
    }

    console.log('✅ Shader compilation and module creation successful');
    return true;
  }

  /**
   * Test hot reload functionality
   */
  private async testHotReload(): Promise<boolean> {
    console.log('🔄 Testing hot reload...');

    // First compile with default settings
    const initialResult = await this.shaderManager.compileShaderModule('pmx_material_shader');
    if (!initialResult.success) {
      console.log('❌ Initial compilation failed');
      return false;
    }

    // Hot reload with different settings
    const reloadSuccess = await this.shaderManager.hotReloadShaderModule('pmx_material_shader', {
      defines: {
        ENABLE_TOON_SHADING: false,
        ENABLE_NORMAL_MAPPING: true,
      },
    });

    if (!reloadSuccess) {
      console.log('❌ Hot reload failed');
      return false;
    }

    console.log('✅ Hot reload working correctly');
    return true;
  }

  /**
   * Performance benchmark
   */
  async runPerformanceBenchmark(): Promise<void> {
    console.log('⚡ Running performance benchmark...\n');

    const iterations = 100;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      await this.shaderManager.compileShaderModule('pmx_material_shader', {
        forceRecompile: true,
      });
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const averageTime = totalTime / iterations;

    console.log(`📊 Performance Results:`);
    console.log(`   Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`   Average compilation: ${averageTime.toFixed(2)}ms`);
    console.log(`   Compilations per second: ${(1000 / averageTime).toFixed(2)}`);
  }
}

/**
 * Run shader system tests
 */
export async function runShaderSystemTests(
  shaderManager: ShaderManager,
  shaderCompiler: ShaderCompiler,
): Promise<boolean> {
  const test = new ShaderSystemTest(shaderManager, shaderCompiler);

  const success = await test.runAllTests();

  if (success) {
    console.log('🎉 All tests passed! Shader system is working correctly.');
    await test.runPerformanceBenchmark();
  } else {
    console.log('💥 Some tests failed. Please check the implementation.');
  }

  return success;
}
