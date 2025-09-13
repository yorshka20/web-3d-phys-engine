import { ShaderCompiler } from '../../ShaderCompiler';
import { ShaderManager } from '../../ShaderManager';
import { pmxMaterialShaderModule } from '../PMXMaterialModule';

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
      () => this.testBackwardCompatibility(),
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
    this.shaderManager.registerShaderModule(pmxMaterialShaderModule);

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

    if (!result.compiledShader.vertexCode || !result.compiledShader.fragmentCode) {
      console.log('❌ Missing vertex or fragment code');
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
      // Test resolving common includes
      const structsContent = await this.shaderCompiler.resolve(
        '/shaders/common/structs.wgsl',
        '/packages/renderer/src/webGPU/core',
      );

      if (!structsContent.includes('struct VertexInput')) {
        console.log('❌ Failed to resolve structs.wgsl');
        return false;
      }

      const bindingsContent = await this.shaderCompiler.resolve(
        '/shaders/common/bindings.wgsl',
        '/packages/renderer/src/webGPU/core',
      );

      if (!bindingsContent.includes('@group(0) @binding(0)')) {
        console.log('❌ Failed to resolve bindings.wgsl');
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

    const testSource = `
#ifdef ENABLE_FEATURE
override featureStrength: f32 = 1.0;
#else
override featureStrength: f32 = 0.0;
#endif

@vertex
fn vs_main() -> @builtin(position) vec4<f32> {
    return vec4<f32>(featureStrength, 0.0, 0.0, 1.0);
}
`;

    // Test with feature enabled
    const enabledResult = this.shaderCompiler.process(testSource, {
      ENABLE_FEATURE: true,
    });

    if (!enabledResult.includes('featureStrength: f32 = 1.0')) {
      console.log('❌ Failed to process enabled macro');
      return false;
    }

    // Test with feature disabled
    const disabledResult = this.shaderCompiler.process(testSource, {
      ENABLE_FEATURE: false,
    });

    if (!disabledResult.includes('featureStrength: f32 = 0.0')) {
      console.log('❌ Failed to process disabled macro');
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

    // Create render pipeline
    const pipeline = this.shaderManager.createRenderPipelineFromShader('pmx_material_shader');
    if (!pipeline) {
      console.log('❌ Failed to create render pipeline');
      return false;
    }

    console.log('✅ Render pipeline created successfully');
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
   * Test backward compatibility
   */
  private async testBackwardCompatibility(): Promise<boolean> {
    console.log('🔄 Testing backward compatibility...');

    // Test legacy shader registration
    const legacyShader = {
      id: 'legacy_test_shader',
      name: 'Legacy Test Shader',
      description: 'Test shader for backward compatibility',
      structs: 'struct VertexInput { @location(0) position: vec3<f32>; }',
      bindingGroups: '@group(0) @binding(0) var<uniform> mvp: mat4x4<f32>;',
      vertexCode: `
        @vertex
        fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
            return mvp * vec4<f32>(position, 1.0);
        }
      `,
      fragmentCode: `
        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
            return vec4<f32>(1.0, 0.0, 0.0, 1.0);
        }
      `,
      requiredUniforms: ['mvp'],
      requiredTextures: [],
      supportedVertexFormats: ['simple'],
      renderState: {
        blendMode: 'replace',
        depthTest: true,
        cullMode: 'back',
      },
    };

    this.shaderManager.registerCustomShader(legacyShader);

    // Verify legacy shader is registered
    const retrievedShader = this.shaderManager.getCustomShader('legacy_test_shader');
    if (!retrievedShader) {
      console.log('❌ Failed to register legacy shader');
      return false;
    }

    console.log('✅ Backward compatibility working correctly');
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
