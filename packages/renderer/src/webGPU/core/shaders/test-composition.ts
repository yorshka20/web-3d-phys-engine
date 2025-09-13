import { shaderFragmentRegistry } from './registry';
import { createCoordinateShaderModule } from './types/material';

/**
 * Test script to verify shader composition functionality
 * This file can be run to test the new shader registry and composition system
 */
export function testShaderComposition() {
  console.log('=== Shader Composition Test ===\n');

  // Test 1: Check if all expected fragments are available
  console.log('1. Testing fragment availability:');
  const expectedFragments = [
    'core/uniforms.wgsl',
    'core/vertex_types.wgsl',
    'bindings/simple_bindings.wgsl',
    'Coordinate.wgsl',
  ];

  for (const fragment of expectedFragments) {
    const isAvailable = shaderFragmentRegistry.has(fragment);
    const content = shaderFragmentRegistry.get(fragment);
    console.log(`  ${isAvailable ? '✓' : '✗'} ${fragment} (${content?.length || 0} chars)`);
  }

  console.log('\n2. Testing coordinate shader module composition:');
  const coordinateModule = createCoordinateShaderModule();

  console.log(`  Shader ID: ${coordinateModule.id}`);
  console.log(`  Source File: ${coordinateModule.sourceFile}`);
  console.log(`  Includes: ${coordinateModule.includes?.join(', ') || 'none'}`);
  console.log(
    `  Vertex Format: ${coordinateModule.compilationOptions.vertexFormat?.join(', ') || 'none'}`,
  );

  console.log('\n3. Testing fragment content preview:');
  for (const include of coordinateModule.includes || []) {
    const content = shaderFragmentRegistry.get(include);
    if (content) {
      const preview = content.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  ${include}: "${preview}..."`);
    }
  }

  console.log('\n4. Available fragments summary:');
  const allFragments = Array.from(shaderFragmentRegistry.keys());
  console.log(`  Total fragments: ${allFragments.length}`);
  console.log(`  Core fragments: ${allFragments.filter((f) => f.startsWith('core/')).length}`);
  console.log(`  Math fragments: ${allFragments.filter((f) => f.startsWith('math/')).length}`);
  console.log(
    `  Lighting fragments: ${allFragments.filter((f) => f.startsWith('lighting/')).length}`,
  );
  console.log(
    `  Binding fragments: ${allFragments.filter((f) => f.startsWith('bindings/')).length}`,
  );
  console.log(
    `  Material shaders: ${allFragments.filter((f) => f.endsWith('.wgsl') && !f.includes('/')).length}`,
  );

  console.log('\n=== Test Complete ===');
}

// Export for potential use in other test files
export { shaderFragmentRegistry };
