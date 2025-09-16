import { VertexFormat } from '@ecs/components/physics/mesh';

/**
 * Shader parameter definition for runtime configuration
 */
export interface ShaderParamDefinition {
  type: 'f32' | 'i32' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4';
  defaultValue: number | boolean | number[];
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

export type ShaderDefine = Record<string, number | boolean | number[]>;

/**
 * Shader compilation options
 */
export interface ShaderCompilationOptions {
  vertexFormat: VertexFormat[];
  defines?: ShaderDefine;
  optimization?: 'none' | 'performance' | 'size';
  debug?: boolean;
}

/**
 * Render state configuration
 */
export interface RenderStateConfig {
  blendMode?: 'replace' | 'alpha-blend' | 'alpha-to-coverage' | 'additive' | 'multiply';
  depthTest?: boolean;
  depthWrite?: boolean;
  cullMode?: 'none' | 'front' | 'back';
  frontFace?: 'ccw' | 'cw';
  sampleCount?: number;
}

/**
 * Shader module definition - new file-based approach
 */
export interface ShaderModule {
  id: string;
  name: string;
  description: string;
  type: 'render' | 'compute';

  // Original file name
  fileName: string;

  // File path to the main shader source
  sourceCode: string;

  // Dependencies - other shader files to include
  includes?: string[];

  // Compilation options
  compilationOptions: ShaderCompilationOptions;

  // Runtime parameters that can be overridden
  runtimeParams?: Record<string, ShaderParamDefinition>;

  // Render state requirements
  renderState: RenderStateConfig;

  // Metadata
  version?: string;
  author?: string;
  tags?: string[];
}

/**
 * Compiled shader result
 */
export interface CompiledShader {
  id: string;
  sourceCode: string;
  shaderModule: GPUShaderModule;
  metadata: {
    compilationTime: number;
    includes: string[];
    defines: ShaderDefine;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Shader validation result
 */
export interface ShaderValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Shader compilation result
 */
export interface ShaderCompilationResult {
  success: boolean;
  compiledShader?: CompiledShader;
  errors: string[];
  warnings: string[];
}

/**
 * Legacy shader definition interface for backward compatibility
 * @deprecated Use ShaderModule instead
 */
export interface CustomShaderDefinition {
  id: string;
  name: string;
  description: string;

  vertexCode: string;
  fragmentCode: string;
  requiredUniforms: string[];
  requiredTextures: string[];
  supportedVertexFormats: ('simple' | 'full')[];
  renderState: {
    blendMode?: 'replace' | 'alpha-blend' | 'alpha-to-coverage';
    depthTest?: boolean;
    depthWrite?: boolean;
    cullMode?: 'none' | 'front' | 'back';
  };
  shaderParams?: {
    [paramName: string]: {
      type: 'f32' | 'i32' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4';
      defaultValue: number | boolean | number[];
      description?: string;
    };
  };
}

/**
 * Shader include resolver interface
 */
export interface ShaderIncludeResolver {
  resolve(includePath: string, basePath: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

/**
 * Shader preprocessor interface
 */
export interface ShaderPreprocessor {
  process(source: string, defines: ShaderDefine): string;
  validate(source: string): ShaderValidationResult;
}
