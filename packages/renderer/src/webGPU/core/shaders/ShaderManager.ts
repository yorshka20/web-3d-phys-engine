import { VertexFormat } from '../../../geometry';
import { Inject, Injectable } from '../decorators';
import { ServiceTokens } from '../decorators/DIContainer';
import { WebGPUResourceManager } from '../ResourceManager';
import { createShaderModules } from './create';
import { ShaderCompiler } from './ShaderCompiler';
import {
  CompiledShader,
  CustomShaderDefinition,
  ShaderCompilationResult,
  ShaderDefine,
  ShaderModule,
} from './types/shader';

/**
 * WebGPU shader manager: holds the shader module catalog and compiles a module the first time
 * something asks for it (a pipeline, a pass stage). Nothing is compiled at startup, so a shader
 * no material or pass in the scene uses costs nothing — and the permutation shaders of the
 * gating design can be registered by the dozen without multiplying startup time.
 */
@Injectable(ServiceTokens.SHADER_MANAGER, {
  lifecycle: 'singleton',
})
export class ShaderManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  @Inject(ServiceTokens.SHADER_COMPILER)
  private shaderCompiler!: ShaderCompiler;

  // Legacy custom shader registry (for backward compatibility) - DEPRECATED
  // @deprecated Use compiledShaders instead
  private customShaders: Map<string, CustomShaderDefinition> = new Map();

  // New shader module registry
  private shaderModules: Map<string, ShaderModule> = new Map();
  private compiledShaders: Map<string, CompiledShader> = new Map();

  // Properties from InjectableClass interface
  resourceCache: Map<string, GPUShaderModule> = new Map();
  resourceLifecycles: Map<string, string> = new Map();

  // Initialization is invoked explicitly by WebGPURenderer.init (like every other manager),
  // NOT from the constructor — the constructor self-call duplicated the whole register cycle
  // (every shader module was created twice; found via a WebGPU Inspector frame capture,
  // 2026-09-01).
  initialize(): void {
    for (const module of createShaderModules()) {
      this.registerShaderModule(module);
    }
    console.log(`Registered ${this.shaderModules.size} shader modules (compiled on first use)`);
  }

  /**
   * Compile a registered module on first use with the defines it declares. Throws on an
   * unknown id or a failed compile: a pipeline built on a missing shader must fail here, not
   * fall back to some other module and render the wrong thing.
   */
  private ensureCompiled(id: string): CompiledShader {
    const existing = this.compiledShaders.get(id);
    if (existing) {
      return existing;
    }
    if (!this.shaderModules.has(id)) {
      throw new Error(`Shader module '${id}' is not registered`);
    }
    const result = this.compileShaderModule(id);
    if (!result.success || !result.compiledShader) {
      throw new Error(`Shader module '${id}' failed to compile: ${result.errors.join('; ')}`);
    }
    return result.compiledShader;
  }

  /**
   * GPU shader module for a pipeline; a material without a custom shader id gets the default
   * shader. Compiles on first use.
   */
  safeGetShaderModule(id?: string): GPUShaderModule {
    return this.ensureCompiled(id ?? 'default_shader').shaderModule;
  }

  /**
   * GPU shader module by id, compiled on first use.
   */
  getShaderModule(id: string): GPUShaderModule {
    return this.ensureCompiled(id).shaderModule;
  }

  /**
   * get shader stats
   */
  getShaderStats(): {
    shaderModules: number;
    compiledShaders: number;
  } {
    return {
      shaderModules: this.shaderModules.size,
      compiledShaders: this.compiledShaders.size,
    };
  }

  /**
   * clean all resources
   */
  onDestroy(): void {
    // clean shader modules
    this.shaderModules.clear();
    this.compiledShaders.clear();
  }

  /**
   * Register a new shader module
   * @param module Shader module definition
   */
  registerShaderModule(module: ShaderModule): void {
    this.shaderModules.set(module.id, module);
    console.log(`Registered shader module: ${module.id} - ${module.name}`);
  }

  /**
   * Get shader module by ID
   * @param id Module ID
   * @returns Shader module or undefined
   */
  getShaderModuleById(id: string): ShaderModule | undefined {
    return this.shaderModules.get(id);
  }

  /**
   * Check if a shader module is registered
   * @param id Module ID
   * @returns True if module is registered
   */
  hasShaderModule(id: string): boolean {
    return this.shaderModules.has(id);
  }

  /**
   * Compile shader module with options
   * @param moduleId Module ID
   * @param options Compilation options
   * @returns Compilation result
   */
  compileShaderModule(
    moduleId: string,
    options: {
      defines?: ShaderDefine;
      vertexFormat?: VertexFormat;
      forceRecompile?: boolean;
    } = {},
  ): ShaderCompilationResult {
    const module = this.shaderModules.get(moduleId);
    if (!module) {
      return {
        success: false,
        errors: [`Shader module '${moduleId}' not found`],
        warnings: [],
      };
    }

    const result = this.shaderCompiler.compileShader(module, options);

    if (result.success && result.compiledShader) {
      this.compiledShaders.set(moduleId, result.compiledShader);
    }

    return result;
  }

  /**
   * Compiled shader (module + composed source + defines) by id, compiled on first use.
   */
  getCompiledShader(id: string): CompiledShader | undefined {
    return this.shaderModules.has(id) ? this.ensureCompiled(id) : undefined;
  }

  /**
   * Compute shader module by id (undefined for render shaders), compiled on first use.
   */
  getComputeShaderModule(id: string): GPUShaderModule | undefined {
    return this.shaderModules.get(id)?.type === 'compute'
      ? this.ensureCompiled(id).shaderModule
      : undefined;
  }

  /**
   * Check if a shader module is a compute shader
   * @param id Shader ID
   * @returns True if the shader is a compute shader
   */
  isComputeShader(id: string): boolean {
    const shaderModule = this.shaderModules.get(id);
    return shaderModule?.type === 'compute';
  }

  /**
   * Hot reload shader module (recompile shader only)
   * @param moduleId Module ID
   * @param options Compilation options
   * @returns Success status
   */
  hotReloadShaderModule(
    moduleId: string,
    options: {
      defines?: ShaderDefine;
      vertexFormat?: VertexFormat;
    } = {},
  ): boolean {
    try {
      // Force recompilation
      const result = this.compileShaderModule(moduleId, {
        ...options,
        forceRecompile: true,
      });

      if (!result.success) {
        console.error(`Hot reload failed for shader '${moduleId}':`, result.errors);
        return false;
      }

      console.log(`Hot reloaded shader: ${moduleId}`);
      console.log(`Note: Pipeline recreation is handled by PipelineManager`);
      return true;
    } catch (error) {
      console.error(`Hot reload error for shader '${moduleId}':`, error);
      return false;
    }
  }
}
