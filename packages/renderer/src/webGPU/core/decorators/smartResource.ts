import { ResourceType } from '../types/constant';
import {
  enforceStorageLimit,
  registerResource,
  resourceIdFor,
  ResourceRegistryHost,
  storeOf,
} from './resourceStore';

/** How long a resource is expected to live. Carried into the registration metadata. */
export type ResourceLifecycle = 'frame' | 'scene' | 'persistent';

export interface SmartResourceOptions {
  lifecycle?: ResourceLifecycle;
  /** Return the existing resource for a repeated id. */
  cache?: boolean;
  /** Hand out the existing resource only while nothing else holds it. */
  pool?: boolean;
  maxCacheSize?: number;
  strictValidation?: boolean;
}

export interface ResourceFactoryOptions {
  validate?: (args: readonly unknown[]) => boolean;
  transform?: <R>(result: R) => R;
  metadata?: (args: readonly unknown[]) => Record<string, unknown>;
}

/**
 * Any method that creates a GPU resource, keyed by a string first argument.
 *
 * `never[]` makes every such method assignable whatever its own parameter types, and carrying
 * the method type `M` through unchanged is what preserves the call site's exact signature —
 * including the generic one on GPUResourceCoordinator.createResource and the branded id on
 * TextureManager.createSampler, neither of which a decorator can re-type faithfully. The price
 * is one cast on the way out, which is why it lives here and not at 19 call sites.
 */
type ResourceCreator = (...args: never[]) => unknown;

/**
 * Caches (or pools) the GPU resource a creation method returns, keyed by the method's FIRST
 * ARGUMENT alone — later arguments never enter the key, so a label must be unique iff the
 * underlying data is unique (docs/renderer-frame-contract.md builds on this).
 */
export function SmartResource<T extends ResourceType>(type: T, options: SmartResourceOptions = {}) {
  return function <M extends ResourceCreator>(target: M, _context: ClassMethodDecoratorContext): M {
    const wrapped = function (this: ResourceRegistryHost, ...args: unknown[]): unknown {
      const resourceId = String(args[0]);
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
            return existingEntry.resource;
          }
          console.warn(`[SmartResource] Resource ${resourceId} is currently in use`);
        }

        return existingEntry.resource;
      }

      const resource = (target as unknown as (...a: unknown[]) => unknown).apply(this, args);

      if (resource && typeof resource === 'object') {
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
        registerResource(this, resourceId, resource, type, options as Record<string, unknown>);
      }

      return resource;
    };
    return wrapped as unknown as M;
  };
}

/**
 * Validates and transforms a creation method's arguments and result, then files the resource
 * the same way @SmartResource does. Unused as of 2026-09-03, kept as tooling.
 */
export function ResourceFactory<T extends ResourceType>(
  type: T,
  factoryOptions: ResourceFactoryOptions = {},
) {
  return function <M extends ResourceCreator>(target: M, context: ClassMethodDecoratorContext): M {
    const wrapped = function (this: ResourceRegistryHost, ...args: unknown[]): unknown {
      if (factoryOptions.validate && !factoryOptions.validate(args)) {
        throw new Error(`Invalid arguments for ${String(context.name)}`);
      }

      let result = (target as unknown as (...a: unknown[]) => unknown).apply(this, args);
      if (factoryOptions.transform) {
        result = factoryOptions.transform(result);
      }

      if (result && typeof result === 'object') {
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
    return wrapped as unknown as M;
  };
}
