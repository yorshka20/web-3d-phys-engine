import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { shaderRegistry } from './shaders/registry';
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

  private compiledShaders: Map<string, CompiledShader> = new Map();
  private includeCache: Map<string, string> = new Map();
  private compilationCache: Map<string, CompiledShader> = new Map();

  /**
   * Compile a shader module
   */
  async compileShader(
    module: ShaderModule,
    options: {
      defines?: ShaderDefine;
      vertexFormat?: string;
      forceRecompile?: boolean;
    } = {},
  ): Promise<ShaderCompilationResult> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(module, options);

    // Check cache first
    if (!options.forceRecompile && this.compilationCache.has(cacheKey)) {
      const cached = this.compilationCache.get(cacheKey)!;
      return {
        success: true,
        compiledShader: cached,
        errors: [],
        warnings: [],
      };
    }

    try {
      // Load and compose shader code
      const composedSource = await this.composeShaderCode(module);

      // Process defines and macros
      const processedSource = this.processDefines(composedSource, {
        ...module.compilationOptions.defines,
        ...options.defines,
      });

      // Validate shader code
      const validation = this.validateShader(processedSource);
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }

      // Create GPU shader module
      const shaderModule = this.device.createShaderModule({
        code: processedSource,
        label: `${module.id}_module`,
      });

      const compilationTime = performance.now() - startTime;

      const compiledShader: CompiledShader = {
        id: module.id,
        sourceCode: processedSource,
        shaderModule,
        metadata: {
          compilationTime,
          includes: module.includes || [],
          defines: { ...module.compilationOptions.defines, ...options.defines },
          errors: [],
          warnings: validation.warnings,
        },
      };

      // Cache the result
      this.compilationCache.set(cacheKey, compiledShader);
      this.compiledShaders.set(module.id, compiledShader);

      return {
        success: true,
        compiledShader,
        errors: [],
        warnings: validation.warnings,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown compilation error'],
        warnings: [],
      };
    }
  }

  /**
   * Compose shader code by loading and combining files
   */
  private async composeShaderCode(module: ShaderModule): Promise<string> {
    let composedCode = '';

    // Load common includes first
    for (const include of module.includes || []) {
      const includeCode = await this.loadShaderFile(include);
      composedCode += includeCode + '\n\n';
    }

    // Load main shader file
    const mainCode = await this.loadShaderFile(module.sourceFile);
    composedCode += mainCode;

    return composedCode;
  }

  /**
   * Load shader file content
   */
  private async loadShaderFile(filePath: string): Promise<string> {
    // Check cache first
    if (this.includeCache.has(filePath)) {
      return this.includeCache.get(filePath)!;
    }

    // In a real implementation, this would load from filesystem
    // For now, we'll return mock content for common files

    const fileName = filePath.split('/').pop() || filePath;

    let content = '';

    switch (fileName) {
      case 'common_structs.wgsl':
        content = shaderRegistry.commonStructs;
        break;

      case 'common_functions.wgsl':
        content = shaderRegistry.commonFunctions;
        break;

      case 'checkerboard.wgsl':
        content = shaderRegistry.checkerboardShader;
        break;

      case 'PMXMaterial.wgsl':
        content = shaderRegistry.pmxMaterialShader;
        break;

      case 'WaterMaterial.wgsl':
        content = shaderRegistry.waterMaterialShader;
        break;

      case 'FireMaterial.wgsl':
        content = shaderRegistry.fireMaterialShader;
        break;

      default:
        throw new Error(`Shader file not found: ${filePath}`);
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
   * Get compiled shader by ID
   */
  getCompiledShader(id: string): CompiledShader | undefined {
    return this.compiledShaders.get(id);
  }

  /**
   * Clear compilation cache
   */
  clearCache(): void {
    this.compilationCache.clear();
    this.includeCache.clear();
  }

  /**
   * Generate cache key for compilation
   */
  private generateCacheKey(
    module: ShaderModule,
    options: {
      defines?: ShaderDefine;
      vertexFormat?: string;
      forceRecompile?: boolean;
    } = {},
  ): string {
    const defines = JSON.stringify(options.defines || {});
    const vertexFormat = options.vertexFormat || 'full';
    return `${module.id}_${vertexFormat}_${defines}`;
  }
}
