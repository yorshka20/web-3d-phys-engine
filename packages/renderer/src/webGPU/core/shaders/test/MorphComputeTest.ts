import { ShaderCompiler } from '../ShaderCompiler';
import { createPMXMorphComputeShaderModule } from '../create';

/**
 * Test for PMX Morph Compute Shader with ENABLE_MORPH_PROCESSING control
 */
export class MorphComputeTest {
  private shaderCompiler: ShaderCompiler;

  constructor(shaderCompiler: ShaderCompiler) {
    this.shaderCompiler = shaderCompiler;
  }

  /**
   * Test morph processing enabled
   */
  async testMorphProcessingEnabled(): Promise<boolean> {
    console.log('🧪 Testing PMX Morph Compute Shader with ENABLE_MORPH_PROCESSING = true...');

    try {
      const module = createPMXMorphComputeShaderModule();
      const result = this.shaderCompiler.compileShader(module, {
        defines: {
          ENABLE_PMX_MORPH_COMPUTE: true,
          ENABLE_MORPH_PROCESSING: true,
        },
      });

      if (result.success) {
        console.log('✅ Morph processing enabled compilation successful');
        console.log('📝 Compiled source preview:');
        console.log(result.compiledShader!.sourceCode.substring(0, 500) + '...');
        return true;
      } else {
        console.log('❌ Morph processing enabled compilation failed:', result.errors);
        return false;
      }
    } catch (error) {
      console.log('❌ Morph processing enabled test failed with error:', error);
      return false;
    }
  }

  /**
   * Test morph processing disabled
   */
  async testMorphProcessingDisabled(): Promise<boolean> {
    console.log('🧪 Testing PMX Morph Compute Shader with ENABLE_MORPH_PROCESSING = false...');

    try {
      const module = createPMXMorphComputeShaderModule();
      const result = this.shaderCompiler.compileShader(module, {
        defines: {
          ENABLE_PMX_MORPH_COMPUTE: true,
          ENABLE_MORPH_PROCESSING: false,
        },
      });

      if (result.success) {
        console.log('✅ Morph processing disabled compilation successful');
        console.log('📝 Compiled source preview:');
        console.log(result.compiledShader!.sourceCode.substring(0, 500) + '...');

        // Verify that morphProcessing is set to 0.0
        if (result.compiledShader!.sourceCode.includes('override morphProcessing: f32 = 0.0')) {
          console.log('✅ Verified morphProcessing is set to 0.0 when disabled');
        } else {
          console.log('❌ morphProcessing override not found or incorrect value');
          return false;
        }

        return true;
      } else {
        console.log('❌ Morph processing disabled compilation failed:', result.errors);
        return false;
      }
    } catch (error) {
      console.log('❌ Morph processing disabled test failed with error:', error);
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<boolean> {
    console.log('🧪 Starting PMX Morph Compute Shader Tests...\n');

    const tests = [
      () => this.testMorphProcessingEnabled(),
      () => this.testMorphProcessingDisabled(),
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

    console.log(`🧪 Test Results: ${passed} passed, ${failed} failed`);
    return failed === 0;
  }
}
