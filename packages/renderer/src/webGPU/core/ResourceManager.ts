/**
 * WebGPU resource types
 */
export enum ResourceType {
  BUFFER = 'buffer',
  SHADER = 'shader',
  PIPELINE = 'pipeline',
  BIND_GROUP_LAYOUT = 'bind_group_layout',
  BIND_GROUP = 'bind_group',
  TEXTURE = 'texture',
  SAMPLER = 'sampler',
}

/**
 * Resource states
 */
export enum ResourceState {
  PENDING = 'pending',
  CREATING = 'creating',
  READY = 'ready',
  ERROR = 'error',
  DESTROYED = 'destroyed',
}

/**
 * Base resource interface
 */
export interface IWebGPUResource {
  id: string;
  type: ResourceType;
  state: ResourceState;
  dependencies: string[];
  metadata?: Record<string, any>;
  destroy(): void;
}

/**
 * Specific resource types
 */
export interface BufferResource extends IWebGPUResource {
  type: ResourceType.BUFFER;
  buffer: GPUBuffer;
}

export interface ShaderResource extends IWebGPUResource {
  type: ResourceType.SHADER;
  shader: GPUShaderModule;
}

export interface RenderPipelineResource extends IWebGPUResource {
  type: ResourceType.PIPELINE;
  pipeline: GPURenderPipeline;
}

export interface ComputePipelineResource extends IWebGPUResource {
  type: ResourceType.PIPELINE;
  pipeline: GPUComputePipeline;
}

export interface BindGroupLayoutResource extends IWebGPUResource {
  type: ResourceType.BIND_GROUP_LAYOUT;
  layout: GPUBindGroupLayout;
}

export interface BindGroupResource extends IWebGPUResource {
  type: ResourceType.BIND_GROUP;
  bindGroup: GPUBindGroup;
}

export interface TextureResource extends IWebGPUResource {
  type: ResourceType.TEXTURE;
  texture: GPUTexture;
}

export interface SamplerResource extends IWebGPUResource {
  type: ResourceType.SAMPLER;
  sampler: GPUSampler;
}

/**
 * Union type for all resources
 */
export type WebGPUResource =
  | BufferResource
  | ShaderResource
  | RenderPipelineResource
  | ComputePipelineResource
  | BindGroupLayoutResource
  | BindGroupResource
  | TextureResource
  | SamplerResource;

/**
 * Resource descriptor for creation
 */
export interface ResourceDescriptor<T extends WebGPUResource> {
  id: string;
  type: ResourceType;
  factory: () => Promise<T>;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

/**
 * Resource metadata
 */
export interface ResourceMetadata {
  id: string;
  type: ResourceType;
  state: ResourceState;
  dependencies: string[];
  createdAt: number;
  lastUsed: number;
  size?: number;
  metadata?: Record<string, any>;
}

/**
 * Unified WebGPU resource manager
 * Manages resource lifecycle, dependencies, and provides unified access
 */
export class WebGPUResourceManager {
  private static instance: WebGPUResourceManager;
  private resources: Map<string, WebGPUResource> = new Map();
  private resourceGraph: Map<string, Set<string>> = new Map();
  private resourceMetadata: Map<string, ResourceMetadata> = new Map();
  private pendingResources: Set<string> = new Set();
  private creatingResources: Set<string> = new Set();

  constructor() {
    if (WebGPUResourceManager.instance) {
      return WebGPUResourceManager.instance;
    }

    WebGPUResourceManager.instance = this;
    console.log('WebGPUResourceManager initialized');
  }

  /**
   * Create a single resource
   */
  async createResource<T extends WebGPUResource>(descriptor: ResourceDescriptor<T>): Promise<T> {
    // Check if resource already exists
    if (this.resources.has(descriptor.id)) {
      const existing = this.resources.get(descriptor.id) as T;
      if (existing.state === ResourceState.READY) {
        return existing;
      }
      // If resource exists but not ready, wait for it
      return this.waitForResource(descriptor.id) as Promise<T>;
    }

    // Initialize resource metadata
    this.initializeResourceMetadata(descriptor);

    // Check dependencies first
    if (descriptor.dependencies && descriptor.dependencies.length > 0) {
      await this.resolveDependencies(descriptor.id);
    }

    // Create the resource
    try {
      this.creatingResources.add(descriptor.id);
      const resource = await descriptor.factory();

      // Update resource state
      resource.state = ResourceState.READY;
      this.resources.set(descriptor.id, resource);
      this.creatingResources.delete(descriptor.id);

      // Update metadata
      this.updateResourceMetadata(descriptor.id, ResourceState.READY);

      console.log(`Resource created successfully: ${descriptor.id}`);
      return resource;
    } catch (error) {
      this.creatingResources.delete(descriptor.id);
      this.updateResourceMetadata(descriptor.id, ResourceState.ERROR);
      console.error(`Failed to create resource ${descriptor.id}:`, error);
      throw error;
    }
  }

  /**
   * Create multiple resources with dependency resolution
   */
  async createResources(descriptors: ResourceDescriptor<WebGPUResource>[]): Promise<void> {
    // Initialize all resource metadata
    descriptors.forEach((desc) => this.initializeResourceMetadata(desc));

    // Create resources in dependency order
    const sortedDescriptors = this.topologicalSort(descriptors);

    for (const descriptor of sortedDescriptors) {
      try {
        await this.createResource(descriptor);
      } catch (error) {
        console.error(`Failed to create resource ${descriptor.id}:`, error);
        // Continue with other resources
      }
    }
  }

  /**
   * Get resource by ID with type safety
   */
  getResource<T extends WebGPUResource>(id: string): T {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new Error(`Resource with ID '${id}' not found.`);
    }
    if (resource.state !== ResourceState.READY) {
      throw new Error(`Resource '${id}' is not ready (state: ${resource.state})`);
    }
    return resource as T;
  }

  /**
   * Get buffer resource
   */
  getBufferResource(id: string): BufferResource {
    return this.getResource<BufferResource>(id);
  }

  /**
   * Get shader resource
   */
  getShaderResource(id: string): ShaderResource {
    return this.getResource<ShaderResource>(id);
  }

  /**
   * Get render pipeline resource
   */
  getRenderPipelineResource(id: string): RenderPipelineResource {
    return this.getResource<RenderPipelineResource>(id);
  }

  /**
   * Get compute pipeline resource
   */
  getComputePipelineResource(id: string): ComputePipelineResource {
    return this.getResource<ComputePipelineResource>(id);
  }

  /**
   * Get bind group layout resource
   */
  getBindGroupLayoutResource(id: string): BindGroupLayoutResource {
    return this.getResource<BindGroupLayoutResource>(id);
  }

  /**
   * Get bind group resource
   */
  getBindGroupResource(id: string): BindGroupResource {
    return this.getResource<BindGroupResource>(id);
  }

  /**
   * Check if resource is ready
   */
  isResourceReady(id: string): boolean {
    const resource = this.resources.get(id);
    return resource?.state === ResourceState.READY;
  }

  /**
   * Wait for resource to be ready
   */
  private async waitForResource(id: string): Promise<WebGPUResource> {
    return new Promise((resolve, reject) => {
      const checkResource = () => {
        const resource = this.resources.get(id);
        if (resource?.state === ResourceState.READY) {
          resolve(resource);
        } else if (resource?.state === ResourceState.ERROR) {
          reject(new Error(`Resource ${id} failed to create`));
        } else {
          setTimeout(checkResource, 10); // Poll every 10ms
        }
      };
      checkResource();
    });
  }

  /**
   * Resolve dependencies for a resource
   */
  private async resolveDependencies(resourceId: string): Promise<void> {
    const metadata = this.resourceMetadata.get(resourceId);
    if (!metadata || !metadata.dependencies.length) return;

    for (const depId of metadata.dependencies) {
      if (!this.isResourceReady(depId)) {
        throw new Error(`Dependency ${depId} for resource ${resourceId} is not ready`);
      }
    }
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(
    descriptors: ResourceDescriptor<WebGPUResource>[],
  ): ResourceDescriptor<WebGPUResource>[] {
    const sorted: ResourceDescriptor<WebGPUResource>[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (descriptor: ResourceDescriptor<WebGPUResource>) => {
      if (visiting.has(descriptor.id)) {
        throw new Error(`Circular dependency detected for resource ${descriptor.id}`);
      }
      if (visited.has(descriptor.id)) return;

      visiting.add(descriptor.id);

      if (descriptor.dependencies) {
        for (const depId of descriptor.dependencies) {
          const dep = descriptors.find((d) => d.id === depId);
          if (dep) visit(dep);
        }
      }

      visiting.delete(descriptor.id);
      visited.add(descriptor.id);
      sorted.push(descriptor);
    };

    descriptors.forEach(visit);
    return sorted;
  }

  /**
   * Initialize resource metadata
   */
  private initializeResourceMetadata(descriptor: ResourceDescriptor<WebGPUResource>): void {
    const metadata: ResourceMetadata = {
      id: descriptor.id,
      type: descriptor.type,
      state: ResourceState.PENDING,
      dependencies: descriptor.dependencies || [],
      createdAt: Date.now(),
      lastUsed: Date.now(),
      metadata: descriptor.metadata,
    };

    this.resourceMetadata.set(descriptor.id, metadata);
    this.pendingResources.add(descriptor.id);

    // Build dependency graph
    if (descriptor.dependencies) {
      descriptor.dependencies.forEach((depId) => {
        if (!this.resourceGraph.has(depId)) {
          this.resourceGraph.set(depId, new Set());
        }
        this.resourceGraph.get(depId)!.add(descriptor.id);
      });
    }
  }

  /**
   * Update resource metadata
   */
  private updateResourceMetadata(id: string, state: ResourceState): void {
    const metadata = this.resourceMetadata.get(id);
    if (metadata) {
      metadata.state = state;
      metadata.lastUsed = Date.now();

      if (state === ResourceState.READY) {
        this.pendingResources.delete(id);
      }
    }
  }

  /**
   * Release a resource
   */
  releaseResource(id: string): void {
    const resource = this.resources.get(id);
    if (resource) {
      resource.destroy();
      this.resources.delete(id);
      this.resourceMetadata.delete(id);
      console.log(`Resource with ID '${id}' released.`);
    }
  }

  /**
   * Clear all resources
   */
  clearAllResources(): void {
    this.resources.forEach((resource) => {
      resource.destroy();
    });
    this.resources.clear();
    this.resourceMetadata.clear();
    this.resourceGraph.clear();
    this.pendingResources.clear();
    this.creatingResources.clear();
    console.log('All WebGPU resources cleared.');
  }

  /**
   * Get resource statistics
   */
  getResourceStats(): {
    total: number;
    ready: number;
    pending: number;
    creating: number;
    error: number;
    byType: Record<ResourceType, number>;
  } {
    const stats = {
      total: this.resources.size,
      ready: 0,
      pending: 0,
      creating: 0,
      error: 0,
      byType: {} as Record<ResourceType, number>,
    };

    for (const metadata of this.resourceMetadata.values()) {
      switch (metadata.state) {
        case ResourceState.READY:
          stats.ready++;
          break;
        case ResourceState.PENDING:
          stats.pending++;
          break;
        case ResourceState.CREATING:
          stats.creating++;
          break;
        case ResourceState.ERROR:
          stats.error++;
          break;
      }

      stats.byType[metadata.type] = (stats.byType[metadata.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get resources by type
   */
  getResourcesByType<T extends WebGPUResource>(type: ResourceType): T[] {
    const resources: T[] = [];
    for (const [id, resource] of this.resources) {
      const metadata = this.resourceMetadata.get(id);
      if (metadata?.type === type && resource.state === ResourceState.READY) {
        resources.push(resource as T);
      }
    }
    return resources;
  }

  /**
   * Check for resource leaks
   */
  checkResourceLeaks(): string[] {
    const leaks: string[] = [];
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [id, metadata] of this.resourceMetadata) {
      if (metadata.state === ResourceState.READY && now - metadata.lastUsed > maxAge) {
        leaks.push(id);
      }
    }

    return leaks;
  }
}
