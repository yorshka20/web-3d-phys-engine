import type { BindGroupManager } from '../BindGroupManager';
import type { BufferManager } from '../BufferManager';
import type { GeometryManager } from '../GeometryManager';
import type { GPUResourceCoordinator } from '../GPUResourceCoordinator';
import type { MaterialBinder } from '../MaterialBinder';
import type { MaterialManager } from '../MaterialManager';
import type { MVPUniformManager } from '../MVPUniformManager';
import type { PipelineFactory } from '../pipeline/PipelineFactory';
import type { PipelineManager } from '../pipeline/PipelineManager';
import type { PMXAnimationBufferManager } from '../PMXAnimationBufferManager';
import type { PMXMaterialProcessor } from '../PMXMaterialProcessor';
import type { WebGPUResourceManager } from '../ResourceManager';
import type { ShaderCompiler } from '../shaders/ShaderCompiler';
import type { ShaderManager } from '../shaders/ShaderManager';
import type { ShadingParamsManager } from '../ShadingParamsManager';
import type { TextureManager } from '../TextureManager';
import type { TimeManager } from '../TimeManager';
import type { WebGPUContext } from '../WebGPUContext';

/**
 * A service identity that carries the type it resolves to.
 *
 * The type parameter is the reason this is an object rather than the bare string it used to
 * be: `@Inject(ServiceTokens.WEBGPU_DEVICE) accessor x!: BufferManager` is now a compile
 * error, where before it was a silent cast that only failed at the first draw call.
 */
export interface Token<T> {
  readonly key: string;
  /** Phantom. Never read at runtime; it is what makes Token<A> and Token<B> incompatible. */
  readonly __service?: T;
}

function token<T>(key: string): Token<T> {
  return { key };
}

/**
 * Every service the renderer resolves through the container.
 *
 * The manager types are imported with `import type`, which TypeScript erases entirely, so the
 * cycle they form with the managers (each of which imports this table) exists only for the
 * type checker and never reaches the bundle.
 */
export const ServiceTokens = {
  RESOURCE_MANAGER: token<WebGPUResourceManager>('ResourceManager'),
  BUFFER_MANAGER: token<BufferManager>('BufferManager'),
  SHADER_MANAGER: token<ShaderManager>('ShaderManager'),
  SHADER_COMPILER: token<ShaderCompiler>('ShaderCompiler'),
  BIND_GROUP_MANAGER: token<BindGroupManager>('BindGroupManager'),
  TEXTURE_MANAGER: token<TextureManager>('TextureManager'),
  GEOMETRY_MANAGER: token<GeometryManager>('GeometryManager'),
  TIME_MANAGER: token<TimeManager>('TimeManager'),
  MVP_UNIFORM_MANAGER: token<MVPUniformManager>('MVPUniformManager'),
  MATERIAL_MANAGER: token<MaterialManager>('MaterialManager'),
  MATERIAL_BINDER: token<MaterialBinder>('MaterialBinder'),
  PIPELINE_MANAGER: token<PipelineManager>('PipelineManager'),
  PIPELINE_FACTORY: token<PipelineFactory>('PipelineFactory'),
  GPU_RESOURCE_COORDINATOR: token<GPUResourceCoordinator>('GPUResourceCoordinator'),
  PMX_MATERIAL_PROCESSOR: token<PMXMaterialProcessor>('PMXMaterialProcessor'),
  SHADING_PARAMS_MANAGER: token<ShadingParamsManager>('ShadingParamsManager'),
  PMX_ANIMATION_BUFFER_MANAGER: token<PMXAnimationBufferManager>('PMXAnimationBufferManager'),
  WEBGPU_DEVICE: token<GPUDevice>('WebGPUDevice'),
  WEBGPU_CONTEXT: token<WebGPUContext>('WebGPUContext'),
} as const;

/**
 * Service registry.
 *
 * Deliberately small: providing and resolving instances is the whole job. Resolution FAILS
 * rather than returning undefined — a missing provider is a wiring bug, and reporting it
 * where the dependency is first used is the only way it lands anywhere near its cause.
 */
export class DIContainer {
  /** token -> how to build it. Registered at class-definition time by @Injectable. */
  private readonly providers = new Map<string, () => unknown>();
  /** token -> the one built instance. Dropped by clear(); providers survive it. */
  private readonly instances = new Map<string, unknown>();
  /** Tokens currently being constructed, to name a self-referential cycle instead of hanging. */
  private readonly building = new Set<string>();

  /** A value built outside the container — the device and the context. */
  provideValue<T>(t: Token<T>, instance: T): void {
    if (this.instances.has(t.key)) {
      throw new Error(`[DI] '${t.key}' already has an instance; a value is provided once`);
    }
    this.instances.set(t.key, instance);
  }

  /**
   * A class the container constructs on first resolve and then keeps. Registered by
   * @Injectable when the class is defined, so nothing has to be constructed up front or in
   * any particular order.
   */
  provideClass<T>(t: Token<T>, ctor: new () => T): void {
    if (this.providers.has(t.key)) {
      throw new Error(`[DI] '${t.key}' already has a provider (${ctor.name})`);
    }
    this.providers.set(t.key, () => new ctor());
  }

  resolve<T>(t: Token<T>): T {
    const existing = this.instances.get(t.key);
    if (existing !== undefined) {
      return existing as T;
    }
    const provider = this.providers.get(t.key);
    if (!provider) {
      throw new Error(
        `[DI] '${t.key}' has no provider. A service registers itself with @Injectable; make ` +
          `sure its module is loaded (see webGPU/core/services.ts).`,
      );
    }
    // A constructor that resolves its own token would otherwise recurse until the stack ends.
    // Two services CAN depend on each other — @Inject resolves on access, not on construction
    // — so only self-reference during construction is an error.
    if (this.building.has(t.key)) {
      throw new Error(`[DI] '${t.key}' is resolved by its own constructor`);
    }
    this.building.add(t.key);
    try {
      const instance = provider() as T;
      this.instances.set(t.key, instance);
      return instance;
    } finally {
      this.building.delete(t.key);
    }
  }

  has<T>(t: Token<T>): boolean {
    return this.instances.has(t.key) || this.providers.has(t.key);
  }

  /** Drop the built instances. Providers survive: their classes are already defined. */
  clear(): void {
    this.instances.clear();
    declarations.length = 0;
  }
}

export const globalContainer = new DIContainer();

/**
 * What every `@Inject` field declared it needs, recorded at class-definition time.
 *
 * This is the reason `@Inject` is a decorator rather than a hand-written getter: a getter is
 * invisible until it is called, so a missing provider only surfaces on the frame that happens
 * to touch it. A declaration table can be checked the moment wiring is done, and it can be
 * printed.
 */
interface Declaration {
  owner: string;
  field: string;
  key: string;
}

const declarations: Declaration[] = [];

export function declareDependency(owner: string, field: string, key: string): void {
  declarations.push({ owner, field, key });
}

/** Throws listing every declared dependency that nothing provides. */
export function validateDependencies(): void {
  const missing = declarations.filter((d) => !globalContainer.has({ key: d.key }));
  if (missing.length > 0) {
    throw new Error(
      `[DI] ${missing.length} declared dependenc(ies) have no provider:\n` +
        missing.map((d) => `  ${d.owner}.${d.field} needs '${d.key}'`).join('\n'),
    );
  }
}

/** Who depends on what, for debugging. */
export function dependencyGraph(): string {
  const byOwner = new Map<string, string[]>();
  for (const d of declarations) {
    byOwner.set(d.owner, [...(byOwner.get(d.owner) ?? []), `${d.field}: ${d.key}`]);
  }
  return [...byOwner]
    .map(([owner, deps]) => `${owner}\n${deps.map((d) => `  -> ${d}`).join('\n')}`)
    .join('\n');
}
