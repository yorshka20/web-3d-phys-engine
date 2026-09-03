import type { WebGPUResourceManager } from '../ResourceManager';
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
  WebGPUResource,
} from '../types/resource';

/**
 * Per-host bookkeeping for the resource decorators.
 *
 * It used to live on the host's prototype, installed by a class decorator that every service
 * had to carry — 13 of the 19 that carried it used no resource decorator at all, and none of
 * the members were visible to TypeScript, so hosts hand-declared them to keep the compiler
 * quiet. Keeping the state here puts it with the decorators that use it, lets it die with the
 * instance, and leaves the host classes clean.
 */

export interface ResourceEntry {
  /** A GPU object. Only its optional `destroy` is ever touched, at eviction. */
  resource: object;
  type: ResourceType;
  created: number;
  lastUsed: number;
  usageCount: number;
  /** Only meaningful in pool mode */
  inUse: boolean;
  destroyed: boolean;
}

/**
 * What a resource-decorated host may offer so its resources also land in
 * WebGPUResourceManager, which is where the render passes look them up (ForwardPass reads
 * 'timeBindGroup' from there, not from BindGroupManager).
 *
 * Optional on purpose: only the hosts that inject a resource manager register, which is the
 * behaviour that has always been in effect — it was just invisible, expressed as a prototype
 * member nothing declared.
 */
export interface ResourceRegistryHost {
  readonly resourceManager?: WebGPUResourceManager;
}

const resourceStores = new WeakMap<object, Map<string, ResourceEntry>>();

export function storeOf(host: object): Map<string, ResourceEntry> {
  let store = resourceStores.get(host);
  if (!store) {
    store = new Map<string, ResourceEntry>();
    resourceStores.set(host, store);
  }
  return store;
}

/**
 * The id a resource is filed under: the first string argument (conventionally the label), or
 * the method name plus a timestamp when there is none.
 */
export function resourceIdFor(methodName: string, args: readonly unknown[]): string {
  const labelArg = args.find((arg) => typeof arg === 'string');
  return typeof labelArg === 'string' ? labelArg : `${methodName}_${Date.now()}`;
}

/** Destroy the least recently used entries that nothing holds, down to `maxSize`. */
export function enforceStorageLimit(store: Map<string, ResourceEntry>, maxSize: number): void {
  if (store.size <= maxSize) {
    return;
  }

  const reusable = Array.from(store.entries())
    .filter(([, entry]) => !entry.inUse)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  const toRemove = store.size - maxSize;
  for (let i = 0; i < toRemove && i < reusable.length; i++) {
    const [resourceId, entry] = reusable[i];
    // Not every GPU object is destroyable (a bind group is not), hence the optional call.
    (entry.resource as { destroy?: () => void }).destroy?.();
    store.delete(resourceId);
  }
}

/** Wrap a raw GPU object in the descriptor shape WebGPUResourceManager stores. */
function resourceWrapperFor(type: ResourceType, resource: object): WebGPUResource {
  const wrapper = {
    type,
    state: ResourceState.READY,
    dependencies: [],
    destroy: () => (resource as { destroy?: () => void }).destroy?.(),
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
      return { ...wrapper, resource } as unknown as WebGPUResource;
  }
}

/** File the resource with the host's resource manager, if it has one. */
export function registerResource(
  host: ResourceRegistryHost,
  id: string,
  resource: object,
  type: ResourceType,
  metadata: Readonly<Record<string, unknown>>,
): void {
  const resourceManager = host.resourceManager;
  if (!resourceManager || !id) {
    return;
  }
  resourceManager
    .createResource({
      id,
      type,
      factory: async () => resourceWrapperFor(type, resource),
      dependencies: (metadata.dependencies as string[]) ?? [],
      metadata: { ...metadata, resourceType: type, createdAt: Date.now() },
    })
    .catch((error: unknown) =>
      console.error(`[SmartResource] Failed to register ${type} ${id}:`, error),
    );
}
