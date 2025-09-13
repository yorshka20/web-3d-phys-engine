import { VertexFormat } from '@ecs/components/physics/mesh';
import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { ShaderCompiler } from './ShaderCompiler';
import {
  createCheckerboardShaderModule,
  createCoordinateShaderModule,
  createDefaultShaderModule,
  createEmissiveShaderModule,
  createFireMaterialShaderModule,
  createPMXMaterialShaderModule,
  createPulsewaveShaderModule,
  createWaterMaterialShaderModule,
} from './shaders/create';
import { shaderFragmentRegistry } from './shaders/registry';
import {
  CompiledShader,
  CustomShaderDefinition,
  ShaderCompilationResult,
  ShaderDefine,
  ShaderModule,
} from './shaders/types/shader';

/**
 * WebGPU shader manager
 * manage shader modules and render pipelines
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

  constructor() {
    this.initialize();
  }

  initialize(): void {
    this.registerShaderModules();
    this.compileShaderModules();
  }

  /**
   * Register shader modules
   */
  private registerShaderModules(): void {
    console.log('Registering shader modules...');

    // Register default shader
    this.registerShaderModule(createDefaultShaderModule());
    console.log('✓ Registered Default Shader');

    // Register checkerboard shader
    this.registerShaderModule(createCheckerboardShaderModule());
    console.log('✓ Registered Checkerboard Shader');

    // Register coordinate shader
    this.registerShaderModule(createCoordinateShaderModule());
    console.log('✓ Registered Coordinate Shader');

    // Register emissive shader
    this.registerShaderModule(createEmissiveShaderModule());
    console.log('✓ Registered Emissive Shader');

    // Register pulsewave shader
    this.registerShaderModule(createPulsewaveShaderModule());
    console.log('✓ Registered Pulsewave Shader');

    // Register PMX Material Shader
    this.registerShaderModule(createPMXMaterialShaderModule());
    console.log('✓ Registered PMX Material Shader');

    // Register Water Material Shader
    this.registerShaderModule(createWaterMaterialShaderModule());
    console.log('✓ Registered Water Material Shader');

    // Register Fire Material Shader
    this.registerShaderModule(createFireMaterialShaderModule());
    console.log('✓ Registered Fire Material Shader');
  }

  private compileShaderModules(): void {
    console.log('Compiling shader modules...');

    this.compileShaderModule('default_shader', {
      vertexFormat: 'full',
      defines: {
        ENABLE_DEFAULT: true,
      },
    });

    this.compileShaderModule('checkerboard_shader', {
      vertexFormat: 'full',
      defines: {
        ENABLE_CHECKERBOARD: true,
      },
    });

    this.compileShaderModule('coordinate_shader', {
      vertexFormat: 'full',
      defines: {
        ENABLE_COORDINATE: true,
      },
    });

    this.compileShaderModule('emissive_shader', {
      vertexFormat: 'full',
      defines: {
        ENABLE_EMISSIVE: true,
      },
    });

    this.compileShaderModule('pulsewave_shader', {
      vertexFormat: 'full',
      defines: {
        ENABLE_PULSEWAVE: true,
      },
    });

    this.compileShaderModule('pmx_material_shader', {
      vertexFormat: 'pmx',
      defines: {
        ENABLE_TOON_SHADING: false,
        ENABLE_NORMAL_MAPPING: true,
        ENABLE_ENVIRONMENT_MAPPING: false,
      },
    });

    this.compileShaderModule('water_material_shader', {
      vertexFormat: 'full',
      defines: {
        ENABLE_WAVE_ANIMATION: true,
      },
    });

    this.compileShaderModule('fire_material_shader', {
      vertexFormat: 'full',
      defines: {
        ENABLE_FLICKER: true,
      },
    });

    console.log('✓ Compiled shader modules');
  }

  /**
   * Safe get or create shader module (fast path with fallback to create)
   * @param id shader id
   * @param descriptor shader descriptor (required if not found)
   * @returns existing or newly created shader module
   */
  safeGetShaderModule(id?: string): GPUShaderModule {
    if (!id) {
      return this.createDefaultShaderModule();
    }

    const existing = this.compiledShaders.get(id);
    if (existing) {
      return existing.shaderModule;
    }

    throw new Error(`Shader module '${id}' not found and no descriptor provided for creation`);
  }

  /**
   * get shader module
   * @param id shader id
   * @returns shader module or undefined
   */
  getShaderModule(id: string): GPUShaderModule | undefined {
    const existing = this.compiledShaders.get(id);
    if (existing) {
      return existing.shaderModule;
    }

    this.compileShaderModule(id, {
      vertexFormat: 'full',
      defines: {
        ENABLE_CHECKERBOARD: true,
      },
    });

    return this.compiledShaders.get(id)!.shaderModule;
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
   * Get compiled shader by ID
   * @param id Shader ID
   * @returns Compiled shader or undefined
   */
  getCompiledShader(id: string): CompiledShader | undefined {
    return this.compiledShaders.get(id);
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

  private createDefaultShaderModule(): GPUShaderModule {
    const shader = this.compiledShaders.get('default_shader');
    if (shader) {
      return shader.shaderModule;
    }

    // Get default shader code from the new registry system
    const defaultShaderCode = shaderFragmentRegistry.get('default.wgsl')!;

    const compiledShader = this.device.createShaderModule({
      code: defaultShaderCode,
      label: 'default_shader',
    });

    this.compiledShaders.set('default_shader', {
      id: 'default_shader',
      sourceCode: defaultShaderCode,
      shaderModule: compiledShader,
      metadata: {
        compilationTime: performance.now(),
        includes: [],
        defines: {},
        errors: [],
        warnings: [],
      },
    });

    return compiledShader;
  }
}
