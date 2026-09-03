import { WebGPUResourceManager } from '../ResourceManager';
import { ResourceState, ResourceType } from '../types/constant';
import {
  BindGroupLayoutResource,
  BindGroupResource,
  BufferResource,
  ComputePipelineResource,
  RenderPipelineResource,
  SamplerResource,
  ShaderResource,
  TextureResource,
} from '../types/resource';
import { declareDependency, globalContainer, Token } from './DIContainer';
import { ResourceFactoryOptions, SmartResourceOptions } from './types';

const showLog = false;

function log(...args: Any[]) {
  if (showLog) {
    console.log(...args);
  }
}

/**
 * Declares that this class is the provider for `token`.
 *
 * Registration happens when the class is DEFINED, and the container constructs it on first
 * resolve — so services are never instantiated by hand, in any particular order, or at all if
 * nothing asks for them. It does not touch the prototype and does not replace the class (the
 * version before 2026-09-03 did both, which cost every manager its `.name` and made merely
 * constructing one mutate global state).
 */
export function Injectable<T>(t: Token<T>) {
  return function (target: Any, _context: ClassDecoratorContext) {
    globalContainer.provideClass(t, target as new () => T);
  };
}

/**
 * Declares a dependency, resolved from the container on access.
 *
 * ```ts
 * @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
 * ```
 *
 * The token carries its service type, so a field typed as something else is a compile error.
 * The `!` cannot be avoided — TypeScript has no way to know a decorator supplies the value —
 * but it is honest here: resolution throws rather than yielding `undefined`.
 */
export function Inject<T>(t: Token<T>) {
  return function (
    _target: ClassAccessorDecoratorTarget<unknown, T>,
    context: ClassAccessorDecoratorContext<unknown, T>,
  ): ClassAccessorDecoratorResult<unknown, T> {
    // Recorded at construction so validateDependencies() can report a missing provider while
    // wiring, instead of on whatever frame first touches the field. This is the reason @Inject
    // is a decorator rather than a hand-written getter: a getter is invisible until called.
    context.addInitializer(function (this: Any) {
      declareDependency(this.constructor?.name ?? '<anonymous>', String(context.name), t.key);
    });

    return {
      // Resolved on access, never cached here: the container holds one instance per token, and
      // laziness is load-bearing — GeometryManager and GPUResourceCoordinator inject each
      // other, so neither could resolve the other while being constructed.
      get(): T {
        return globalContainer.resolve(t);
      },
    };
  };
}

interface ResourceEntry {
  resource: Any;
  type: ResourceType;
  created: number;
  lastUsed: number;
  usageCount: number;
  inUse: boolean; // Only meaningful in pool mode
  destroyed: boolean;
}

/**
 * Per-host storage for @SmartResource, keyed by the instance.
 *
 * It used to live on the host's prototype, installed by a class decorator that every service
 * had to carry — 13 of the 19 that carried it used no resource decorator at all, and none of
 * the members were visible to TypeScript, so hosts hand-declared them to keep the compiler
 * quiet. Keeping the state here puts it with the decorator that uses it, lets it die with the
 * instance, and leaves the host classes clean.
 */
const resourceStores = new WeakMap<object, Map<string, ResourceEntry>>();

function storeOf(host: object): Map<string, ResourceEntry> {
  let store = resourceStores.get(host);
  if (!store) {
    store = new Map<string, ResourceEntry>();
    resourceStores.set(host, store);
  }
  return store;
}

/**
 * What a @SmartResource host may offer so its resources also land in WebGPUResourceManager,
 * which is where the render passes look them up (ForwardPass reads 'timeBindGroup' from
 * there, not from BindGroupManager).
 *
 * Declared here rather than bolted onto every class's prototype: only the hosts that inject a
 * resource manager register, and this states that contract in a form the compiler can see.
 */
export interface ResourceRegistryHost {
  readonly resourceManager?: WebGPUResourceManager;
}

/** Wrap a raw GPU object in the descriptor shape WebGPUResourceManager stores. */
function resourceWrapperFor(type: ResourceType, resource: Any): Any {
  const wrapper = {
    type,
    state: ResourceState.READY,
    dependencies: [],
    destroy: () => resource?.destroy?.(),
  };
  switch (type) {
    case ResourceType.BUFFER:
      return { ...wrapper, buffer: resource } as BufferResource;
    case ResourceType.SHADER:
      return { ...wrapper, shader: resource } as ShaderResource;
    case ResourceType.PIPELINE:
      return { ...wrapper, pipeline: resource } as RenderPipelineResource | ComputePipelineResource;
    case ResourceType.BIND_GROUP_LAYOUT:
      return { ...wrapper, layout: resource } as BindGroupLayoutResource;
    case ResourceType.BIND_GROUP:
      return { ...wrapper, bindGroup: resource } as BindGroupResource;
    case ResourceType.TEXTURE:
      return { ...wrapper, texture: resource } as TextureResource;
    case ResourceType.SAMPLER:
      return { ...wrapper, sampler: resource } as SamplerResource;
    default:
      return { ...wrapper, resource };
  }
}

/** File the resource with the host's resource manager, if it has one. */
function registerResource(
  host: ResourceRegistryHost,
  id: string,
  resource: Any,
  type: ResourceType,
  options: Any,
): void {
  const resourceManager = host.resourceManager;
  if (!resourceManager || !resource || !id) {
    return;
  }
  resourceManager
    .createResource({
      id,
      type,
      factory: async () => resourceWrapperFor(type, resource),
      dependencies: options.dependencies || [],
      metadata: { ...options, resourceType: type, createdAt: Date.now() },
    })
    .then(() => log(`[SmartResource] Registered resource: ${id}, type: ${type}`))
    .catch((error: Any) =>
      console.error(`[SmartResource] Failed to register ${type} ${id}:`, error),
    );
}

/** Destroy the least recently used entries that nothing holds, down to `maxSize`. */
function enforceStorageLimit(store: Map<string, ResourceEntry>, maxSize: number): void {
  if (store.size <= maxSize) {
    return;
  }
  log(`[SmartResource] Enforcing storage limit: ${store.size} > ${maxSize}`);

  const reusable = Array.from(store.entries())
    .filter(([, entry]) => !entry.inUse)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  const toRemove = store.size - maxSize;
  for (let i = 0; i < toRemove && i < reusable.length; i++) {
    const [resourceId, entry] = reusable[i];
    log(`[SmartResource] Destroying resource: ${resourceId}`);
    entry.resource.destroy?.();
    store.delete(resourceId);
  }
}

/**
 * Caches (or pools) the GPU resource a creation method returns, keyed by the method's FIRST
 * ARGUMENT alone — later arguments never enter the key, so a label must be unique iff the
 * underlying data is unique (docs/renderer-frame-contract.md builds on this).
 */
export function SmartResource<T extends ResourceType>(type: T, options: SmartResourceOptions = {}) {
  return function (target: (...args: Any[]) => Any, _context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: ResourceRegistryHost, ...args: [string, ...Any[]]) {
      const resourceId = args[0];
      const store = storeOf(this);
      const existingEntry = store.get(resourceId);

      if (existingEntry && !existingEntry.destroyed) {
        if (options.cache) {
          return existingEntry.resource;
        }

        if (options.pool) {
          if (!existingEntry.inUse) {
            existingEntry.inUse = true;
            existingEntry.lastUsed = Date.now();
            existingEntry.usageCount++;
            log(`[SmartResource] Acquired pooled resource: ${resourceId}`);
            return existingEntry.resource;
          }
          console.warn(`[SmartResource] Resource ${resourceId} is currently in use`);
        }

        return existingEntry.resource;
      }

      log(`[SmartResource] Creating new resource: ${resourceId}, type: ${type}`);
      const resource = originalMethod.apply(this, args);

      if (resource) {
        store.set(resourceId, {
          resource,
          type,
          created: Date.now(),
          lastUsed: Date.now(),
          usageCount: 1,
          // In use in both modes, so a fresh resource is never evicted before its first use
          inUse: true,
          destroyed: false,
        });
        enforceStorageLimit(store, options.maxCacheSize ?? 500);
        registerResource(this, resourceId, resource, type, options);
      }

      return resource;
    };
  };
}

/**
 * The id a resource is filed under: the first string argument (conventionally the label), or
 * the method name plus a timestamp when there is none.
 */
function resourceIdFor(methodName: string, args: Any[]): string {
  const labelArg = args.find((arg: Any) => typeof arg === 'string');
  return typeof labelArg === 'string' ? labelArg : `${methodName}_${Date.now()}`;
}

/**
 * Validates and transforms a creation method's arguments and result, then files the resource
 * in the same per-instance store @SmartResource uses.
 *
 * Unused as of 2026-09-03, kept as tooling.
 */
export function ResourceFactory<T extends ResourceType>(
  type: T,
  factoryOptions: ResourceFactoryOptions = {},
) {
  return function (target: (...args: Any[]) => Any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: ResourceRegistryHost, ...args: Any[]) {
      if (factoryOptions.validate && !factoryOptions.validate(args)) {
        throw new Error(`Invalid arguments for ${String(context.name)}`);
      }

      let result = originalMethod.apply(this, args);
      if (factoryOptions.transform) {
        result = factoryOptions.transform(result);
      }

      if (result) {
        const resourceId = resourceIdFor(String(context.name), args);
        registerResource(this, resourceId, result, type, {
          ...(factoryOptions.metadata ? factoryOptions.metadata(args) : {}),
          factory: String(context.name),
        });
        storeOf(this).set(resourceId, {
          resource: result,
          type,
          created: Date.now(),
          lastUsed: Date.now(),
          usageCount: 1,
          inUse: true,
          destroyed: false,
        });
      }

      return result;
    };
  };
}

interface PerformanceStats {
  count: number;
  average: number;
  min: number;
  max: number;
  total: number;
}

/** Execution times per decorated method, per instance. */
const performanceSamples = new WeakMap<object, Map<string, number[]>>();

/**
 * Samples of one host's decorated methods. A module-level reader rather than methods installed
 * on the instance, which is what the original did — three helpers appeared on every host the
 * first time a monitored method ran, invisible to TypeScript.
 */
export function performanceStats(host: object, methodName: string): PerformanceStats {
  const times = performanceSamples.get(host)?.get(methodName);
  if (!times || times.length === 0) {
    return { count: 0, average: 0, min: 0, max: 0, total: 0 };
  }
  const total = times.reduce((a, b) => a + b, 0);
  return {
    count: times.length,
    average: total / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    total,
  };
}

/**
 * Times a method and keeps the last `maxSamples` durations, readable with performanceStats().
 * Unused as of 2026-09-03, kept as tooling.
 */
export function MonitorPerformance(
  options: { logThreshold?: number; maxSamples?: number; enableLogging?: boolean } = {},
) {
  const { logThreshold = 1, maxSamples = 100, enableLogging = true } = options;

  return function (target: Any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;
    const methodName = String(context.name);

    return function (this: object, ...args: Any[]) {
      const startTime = performance.now();
      try {
        return originalMethod.apply(this, args);
      } finally {
        const executionTime = performance.now() - startTime;
        let samples = performanceSamples.get(this);
        if (!samples) {
          samples = new Map<string, number[]>();
          performanceSamples.set(this, samples);
        }
        const times = samples.get(methodName) ?? [];
        times.push(executionTime);
        if (times.length > maxSamples) {
          times.shift();
        }
        samples.set(methodName, times);

        if (enableLogging && executionTime >= logThreshold) {
          log(`[Performance] ${methodName} took ${executionTime.toFixed(2)}ms`);
        }
      }
    };
  };
}
