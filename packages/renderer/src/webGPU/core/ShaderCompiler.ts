import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { shaderFragmentRegistry } from './shaders/registry';
import {
  CompiledShader,
  ShaderCompilationResult,
  ShaderDefine,
  ShaderModule,
  ShaderValidationResult,
} from './shaders/types/shader';

/**
 * WebGPU Shader Compiler
 * Handles shader file loading, preprocessing, and compilation
 * Only responsible for shader compilation, not pipeline creation
 */
@Injectable(ServiceTokens.SHADER_COMPILER, {
  lifecycle: 'singleton',
})
export class ShaderCompiler {
  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  private includeCache: Map<string, string> = new Map();

  /**
   * Compile a shader module with comprehensive error handling and validation
   */
  compileShader(
    module: ShaderModule,
    options: {
      defines?: ShaderDefine;
      vertexFormat?: string;
    } = {},
  ): ShaderCompilationResult {
    const startTime = performance.now();
    const compilationLog: string[] = [];

    try {
      compilationLog.push(`Starting compilation of shader module: ${module.id}`);

      // Pre-validate shader module
      const moduleValidation = this.validateShaderModule(module);
      if (!moduleValidation.isValid) {
        const errorMsg = `Shader module validation failed. Missing fragments: ${moduleValidation.missingFragments.join(', ')}`;
        compilationLog.push(`✗ ${errorMsg}`);
        return {
          success: false,
          errors: [errorMsg],
          warnings: [],
        };
      }
      compilationLog.push(`✓ Shader module validation passed`);

      // Get composition preview
      const preview = this.getCompositionPreview(module);
      compilationLog.push(
        `Composition preview: ${preview.totalFragments} fragments, ~${Math.round(preview.estimatedSize / 1024)}KB`,
      );

      // Load and compose shader code
      compilationLog.push(`Composing shader code...`);
      const composedSource = this.composeShaderCode(module);
      compilationLog.push(`✓ Shader composition completed (${composedSource.length} characters)`);

      // Process defines and macros
      const mergedDefines = {
        ...module.compilationOptions.defines,
        ...options.defines,
      };
      compilationLog.push(`Processing defines: ${Object.keys(mergedDefines).length} definitions`);
      const processedSource = this.processDefines(composedSource, mergedDefines);
      compilationLog.push(`✓ Defines processing completed`);

      // Validate shader code
      compilationLog.push(`Validating shader syntax...`);
      const validation = this.validateShader(processedSource);
      if (!validation.isValid) {
        compilationLog.push(`✗ Shader validation failed: ${validation.errors.join(', ')}`);
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }
      compilationLog.push(`✓ Shader validation passed`);

      // Create GPU shader module
      compilationLog.push(`Creating WebGPU shader module...`);
      const shaderModule = this.device.createShaderModule({
        code: processedSource,
        label: `${module.id}_module`,
      });
      compilationLog.push(`✓ WebGPU shader module created successfully`);

      const compilationTime = performance.now() - startTime;

      const compiledShader: CompiledShader = {
        id: module.id,
        sourceCode: processedSource,
        shaderModule,
        metadata: {
          compilationTime,
          includes: module.includes || [],
          defines: mergedDefines,
          errors: [],
          warnings: validation.warnings,
        },
      };

      compilationLog.push(`✓ Shader compilation completed in ${compilationTime.toFixed(2)}ms`);
      console.debug(`Shader compilation successful for ${module.id}:`, compilationLog.join('\n'));

      return {
        success: true,
        compiledShader,
        errors: [],
        warnings: validation.warnings,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown compilation error';
      compilationLog.push(`✗ Compilation failed: ${errorMsg}`);

      console.error(`Shader compilation failed for ${module.id}:`, {
        error: errorMsg,
        compilationLog,
        module: {
          id: module.id,
          sourceCode: module.fileName,
          includes: module.includes,
        },
        options,
      });

      return {
        success: false,
        errors: [errorMsg],
        warnings: [],
      };
    }
  }

  /**
   * Compose shader code by loading and combining files
   * This is the core method that handles the shader composition process
   */
  private composeShaderCode(module: ShaderModule): string {
    const compositionLog: string[] = [];
    let composedCode = '';

    try {
      // Add composition header comment
      composedCode += `// Composed shader: ${module.id}\n`;
      composedCode += `// Generated at: ${new Date().toISOString()}\n`;
      composedCode += `// Includes: ${(module.includes || []).join(', ')}\n`;
      composedCode += `// Main file: ${module.fileName}\n\n`;

      // Load and compose include fragments in order
      if (module.includes && module.includes.length > 0) {
        compositionLog.push(`Loading ${module.includes.length} include fragments...`);

        for (const [index, include] of module.includes.entries()) {
          compositionLog.push(`[${index + 1}/${module.includes.length}] Loading: ${include}`);

          try {
            const includeCode = this.loadShaderFragment(include);
            composedCode += `// === ${include} ===\n`;
            composedCode += includeCode.trim() + '\n\n';
            compositionLog.push(`✓ Successfully loaded: ${include}`);
          } catch (error) {
            const errorMsg = `Failed to load include fragment: ${include}`;
            compositionLog.push(`✗ ${errorMsg}`);
            throw new Error(
              `${errorMsg}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }
      }

      // Load main shader file
      compositionLog.push(`Loading main shader: ${module.fileName}`);
      try {
        const mainCode = module.sourceCode;
        composedCode += `// === ${module.fileName} (main) ===\n`;
        composedCode += mainCode.trim();
        compositionLog.push(`✓ Successfully loaded main shader: ${module.fileName}`);
      } catch (error) {
        const errorMsg = `Failed to load main shader: ${module.fileName}`;
        compositionLog.push(`✗ ${errorMsg}`);
        throw new Error(
          `${errorMsg}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Add composition footer
      composedCode += `\n\n// === End of composed shader: ${module.id} ===`;

      // Log composition success
      console.debug(`Shader composition successful for ${module.id}:`, compositionLog.join('\n'));

      return composedCode;
    } catch (error) {
      const errorMsg = `Shader composition failed for ${module.id}`;
      console.error(errorMsg, {
        error: error instanceof Error ? error.message : 'Unknown error',
        compositionLog,
        includes: module.includes,
        sourceFile: module.fileName,
      });
      throw error;
    }
  }

  /**
   * Load shader fragment content from fragment registry
   */
  private loadShaderFragment(filePath: string): string {
    // Check cache first
    if (this.includeCache.has(filePath)) {
      return this.includeCache.get(filePath)!;
    }

    // Look up in fragment registry
    const content = shaderFragmentRegistry.get(filePath);

    if (!content) {
      throw new Error(
        `Shader fragment not found: ${filePath}. Available fragments: ${Array.from(shaderFragmentRegistry.keys()).join(', ')}`,
      );
    }

    // Cache the content
    this.includeCache.set(filePath, content);
    return content;
  }

  /**
   * Process defines and macros
   */
  private processDefines(source: string, defines: ShaderDefine): string {
    let processed = source;

    // Process conditional compilation directives
    processed = this.processConditionalDirectives(processed, defines);

    // Replace override declarations with actual values
    processed = this.processOverrideDeclarations(processed, defines);

    return processed;
  }

  /**
   * Process conditional compilation directives
   */
  private processConditionalDirectives(source: string, defines: ShaderDefine): string {
    const ifdefRegex = /#ifdef\s+(\w+)(.*?)(?:#else(.*?))?#endif/gs;
    const ifndefRegex = /#ifndef\s+(\w+)(.*?)(?:#else(.*?))?#endif/gs;

    let processed = source;

    // Process #ifdef
    processed = processed.replace(ifdefRegex, (match, define, ifBlock, elseBlock) => {
      const isDefined = defines[define] !== undefined && defines[define] !== false;
      return isDefined ? ifBlock : elseBlock || '';
    });

    // Process #ifndef
    processed = processed.replace(ifndefRegex, (match, define, ifBlock, elseBlock) => {
      const isDefined = defines[define] !== undefined && defines[define] !== false;
      return !isDefined ? ifBlock : elseBlock || '';
    });

    return processed;
  }

  /**
   * Process override declarations
   */
  private processOverrideDeclarations(source: string, defines: ShaderDefine): string {
    let processed = source;

    // Replace override declarations with actual values
    for (const [key, value] of Object.entries(defines)) {
      const overrideRegex = new RegExp(`override\\s+${key}:\\s*\\w+\\s*=\\s*[^;]+;`, 'g');
      const wgslValue = this.convertValueToWGSL(value);
      processed = processed.replace(overrideRegex, `override ${key} = ${wgslValue};`);
    }

    return processed;
  }

  /**
   * Convert JavaScript value to WGSL format
   */
  private convertValueToWGSL(value: number | boolean | number[]): string {
    if (typeof value === 'number') {
      return `${value}f`;
    } else if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    } else if (Array.isArray(value)) {
      if (value.length === 2) {
        return `vec2<f32>(${value[0]}f, ${value[1]}f)`;
      } else if (value.length === 3) {
        return `vec3<f32>(${value[0]}f, ${value[1]}f, ${value[2]}f)`;
      } else if (value.length === 4) {
        return `vec4<f32>(${value[0]}f, ${value[1]}f, ${value[2]}f, ${value[3]}f)`;
      }
    }
    return `${value}`;
  }

  /**
   * Validate shader source code
   */
  private validateShader(source: string): ShaderValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Basic syntax validation
    if (!source.includes('@vertex') && !source.includes('@fragment')) {
      errors.push('Shader must contain at least one @vertex or @fragment function');
    }

    // Check for common issues
    if (source.includes('@location(') && !source.includes('@builtin(position)')) {
      warnings.push('Consider adding @builtin(position) for vertex output');
    }

    // Check for undefined variables
    const bindingMatches = source.match(/@group\(\d+\)\s+@binding\(\d+\)\s+var/gi);
    if (bindingMatches && bindingMatches.length > 10) {
      warnings.push('Consider reducing the number of bindings for better performance');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Clear compilation cache
   */
  clearCache(): void {
    this.includeCache.clear();
  }

  /**
   * Get list of available shader fragments
   */
  getAvailableFragments(): string[] {
    return Array.from(shaderFragmentRegistry.keys());
  }

  /**
   * Get fragment content for debugging
   */
  getFragmentContent(fragmentPath: string): string | null {
    return shaderFragmentRegistry.get(fragmentPath) || null;
  }

  /**
   * Validate that all includes in a shader module are available
   */
  validateShaderModule(module: ShaderModule): { isValid: boolean; missingFragments: string[] } {
    const missingFragments: string[] = [];

    // Check main source file
    if (!shaderFragmentRegistry.has(module.fileName)) {
      missingFragments.push(module.fileName);
    }

    // Check includes
    if (module.includes) {
      for (const include of module.includes) {
        if (!shaderFragmentRegistry.has(include)) {
          missingFragments.push(include);
        }
      }
    }

    return {
      isValid: missingFragments.length === 0,
      missingFragments,
    };
  }

  /**
   * Get detailed composition preview for a shader module
   */
  getCompositionPreview(module: ShaderModule): {
    sourceFile: string;
    includes: string[];
    totalFragments: number;
    estimatedSize: number;
  } {
    const includes = module.includes || [];
    let estimatedSize = 0;

    // Estimate size by checking fragment lengths
    if (shaderFragmentRegistry.has(module.fileName)) {
      estimatedSize += shaderFragmentRegistry.get(module.fileName)!.length;
    }

    for (const include of includes) {
      if (shaderFragmentRegistry.has(include)) {
        estimatedSize += shaderFragmentRegistry.get(include)!.length;
      }
    }

    return {
      sourceFile: module.fileName,
      includes,
      totalFragments: includes.length + 1,
      estimatedSize,
    };
  }
}
