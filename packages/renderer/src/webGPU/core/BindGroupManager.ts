import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { BindGroupDescriptor, BindGroupLayoutDescriptor, BindGroupLayoutVisibility } from './types';
import { ResourceType } from './types/constant';

/**
 * BindGroupManager - Dedicated manager for bind groups and bind group layouts
 * Handles creation, caching, and lifecycle management of all bind group resources
 */
@Injectable(ServiceTokens.BIND_GROUP_MANAGER, {
  lifecycle: 'singleton',
})
export class BindGroupManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  // Cache for bind group layouts
  private bindGroupLayouts: Map<string, GPUBindGroupLayout> = new Map();

  // Cache for bind groups
  private bindGroups: Map<string, GPUBindGroup> = new Map();

  // Cache statistics
  private layoutCacheHitCount = 0;
  private layoutCacheMissCount = 0;
  private groupCacheHitCount = 0;
  private groupCacheMissCount = 0;

  // Properties from InjectableClass interface
  resourceCache?: Map<string, GPUBindGroup | GPUBindGroupLayout>;
  resourceLifecycles?: Map<string, string>;

  /**
   * Create bind group layout with automatic resource registration
   * @param id Layout ID
   * @param descriptor Layout descriptor
   * @returns Created bind group layout
   */
  @SmartResource(ResourceType.BIND_GROUP_LAYOUT, {
    lifecycle: 'persistent',
    cache: true,
  })
  createBindGroupLayout(id: string, descriptor: BindGroupLayoutDescriptor): GPUBindGroupLayout {
    // Check cache first
    if (this.bindGroupLayouts.has(id)) {
      return this.bindGroupLayouts.get(id)!;
    }

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: descriptor.entries,
      label: descriptor.label || id,
    });

    // Cache bind group layout
    this.bindGroupLayouts.set(id, bindGroupLayout);

    return bindGroupLayout;
  }

  /**
   * Get bind group layout by ID
   * @param id Layout ID
   * @returns Bind group layout or undefined
   */
  getBindGroupLayout(id: string): GPUBindGroupLayout | undefined {
    const layout = this.bindGroupLayouts.get(id);
    if (layout) {
      this.layoutCacheHitCount++;
    } else {
      this.layoutCacheMissCount++;
    }
    return layout;
  }

  /**
   * Safe get or create bind group layout (fast path with fallback to create)
   * @param id Layout ID
   * @param descriptor Layout descriptor (required if not found)
   * @returns Existing or newly created bind group layout
   */
  safeGetBindGroupLayout(id: string, descriptor?: BindGroupLayoutDescriptor): GPUBindGroupLayout {
    // Fast path: try to get existing resource from both caches
    const existing = this.bindGroupLayouts.get(id);
    if (existing) {
      return existing;
    }

    // Also check resourceCache (from @SmartResource decorator)
    if (this.resourceCache && this.resourceCache.has(id)) {
      const cachedResource = this.resourceCache.get(id) as GPUBindGroupLayout;
      if (cachedResource) {
        return cachedResource;
      }
    }

    // Slow path: create new resource if descriptor provided
    if (descriptor) {
      return this.createBindGroupLayout(id, descriptor);
    }

    throw new Error(`Bind group layout '${id}' not found and no descriptor provided for creation`);
  }

  /**
   * Create bind group with automatic resource registration
   * @param id Bind group ID
   * @param descriptor Bind group descriptor
   * @returns Created bind group
   */
  @SmartResource(ResourceType.BIND_GROUP, {
    lifecycle: 'scene',
    cache: true,
  })
  createBindGroup(id: string, descriptor: BindGroupDescriptor): GPUBindGroup {
    // Check cache first
    if (this.bindGroups.has(id)) {
      return this.bindGroups.get(id)!;
    }

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: descriptor.layout,
      entries: descriptor.entries,
      label: descriptor.label || id,
    });

    // Cache bind group
    this.bindGroups.set(id, bindGroup);

    return bindGroup;
  }

  /**
   * Get bind group by ID
   * @param id Bind group ID
   * @returns Bind group or undefined
   */
  getBindGroup(id: string): GPUBindGroup | undefined {
    const group = this.bindGroups.get(id);
    if (group) {
      this.groupCacheHitCount++;
    } else {
      this.groupCacheMissCount++;
    }
    return group;
  }

  /**
   * Safe get or create bind group (fast path with fallback to create)
   * @param id Bind group ID
   * @param descriptor Bind group descriptor (required if not found)
   * @returns Existing or newly created bind group
   */
  safeGetBindGroup(id: string, descriptor?: BindGroupDescriptor): GPUBindGroup {
    // Fast path: try to get existing resource from both caches
    const existing = this.bindGroups.get(id);
    if (existing) {
      return existing;
    }

    // Also check resourceCache (from @SmartResource decorator)
    if (this.resourceCache && this.resourceCache.has(id)) {
      const cachedResource = this.resourceCache.get(id) as GPUBindGroup;
      if (cachedResource) {
        return cachedResource;
      }
    }

    // Slow path: create new resource if descriptor provided
    if (descriptor) {
      return this.createBindGroup(id, descriptor);
    }

    throw new Error(`Bind group '${id}' not found and no descriptor provided for creation`);
  }

  /**
   * Create standard bind group layouts for common use cases
   */
  createStandardBindGroupLayouts(): Map<string, GPUBindGroupLayout> {
    const layouts = new Map<string, GPUBindGroupLayout>();

    // Time uniforms layout
    layouts.set(
      'timeBindGroupLayout',
      this.createBindGroupLayout('timeBindGroupLayout', {
        entries: [
          {
            binding: 0,
            visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'Time Bind Group Layout',
      }),
    );

    // MVP uniforms layout
    layouts.set(
      'mvpBindGroupLayout',
      this.createBindGroupLayout('mvpBindGroupLayout', {
        entries: [
          {
            binding: 0,
            visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'MVP Bind Group Layout',
      }),
    );

    // Texture layout
    layouts.set(
      'textureBindGroupLayout',
      this.createBindGroupLayout('textureBindGroupLayout', {
        entries: [
          {
            binding: 0,
            visibility: BindGroupLayoutVisibility.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 1,
            visibility: BindGroupLayoutVisibility.FRAGMENT,
            sampler: { type: 'filtering' },
          },
        ],
        label: 'Texture Bind Group Layout',
      }),
    );

    // Material uniforms layout
    layouts.set(
      'materialBindGroupLayout',
      this.createBindGroupLayout('materialBindGroupLayout', {
        entries: [
          {
            binding: 0,
            visibility: BindGroupLayoutVisibility.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'Material Bind Group Layout',
      }),
    );

    return layouts;
  }

  /**
   * Get shader stage flags
   * @param stage Shader stage
   * @returns Stage flags
   */
  getShaderStageFlags(stage: string): BindGroupLayoutVisibility {
    switch (stage) {
      case 'vertex':
        return BindGroupLayoutVisibility.VERTEX;
      case 'fragment':
        return BindGroupLayoutVisibility.FRAGMENT;
      case 'compute':
        return BindGroupLayoutVisibility.COMPUTE;
      default:
        return BindGroupLayoutVisibility.VERTEX_FRAGMENT;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    bindGroupLayouts: number;
    bindGroups: number;
    layoutCacheHits: number;
    layoutCacheMisses: number;
    groupCacheHits: number;
    groupCacheMisses: number;
  } {
    return {
      bindGroupLayouts: this.bindGroupLayouts.size,
      bindGroups: this.bindGroups.size,
      layoutCacheHits: this.layoutCacheHitCount,
      layoutCacheMisses: this.layoutCacheMissCount,
      groupCacheHits: this.groupCacheHitCount,
      groupCacheMisses: this.groupCacheMissCount,
    };
  }

  /**
   * Clear bind group layout cache
   */
  clearBindGroupLayoutCache(): void {
    this.bindGroupLayouts.clear();
    this.layoutCacheHitCount = 0;
    this.layoutCacheMissCount = 0;
  }

  /**
   * Clear bind group cache
   */
  clearBindGroupCache(): void {
    this.bindGroups.clear();
    this.groupCacheHitCount = 0;
    this.groupCacheMissCount = 0;
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.clearBindGroupLayoutCache();
    this.clearBindGroupCache();
  }

  /**
   * Cleanup resources
   */
  onDestroy(): void {
    this.clearAllCaches();
  }

  /**
   * Cleanup frame resources (bind groups are typically frame-level)
   */
  cleanupFrameResources(): void {
    // Note: Bind groups are typically frame-level resources
    // This can be called at the end of each frame to clean up temporary bind groups
    // For now, we keep them cached for reuse across frames
  }
}
