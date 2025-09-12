import { Component } from '@ecs/core/ecs/Component';
import { AssetDescriptor, assetRegistry, AssetType } from '@renderer/webGPU/core/AssetRegistry';
import { PMXModel } from './PMXModel';

/**
 * PMX Mesh Component
 * Represents a PMX model loaded from file using the new asset system
 * This component holds asset references, not GPU resources
 */
export class PMXMeshComponent extends Component {
  public static readonly componentName = 'PMXMesh';

  public assetId: string; // Asset ID in the registry
  public assetDescriptor: AssetDescriptor | null = null; // Asset descriptor (lazy loaded)
  public gpuResource: unknown | null = null; // GPU resource (created on-demand)
  public visible: boolean = true;
  public castShadow: boolean = true;
  public receiveShadow: boolean = true;
  public layer: number = 0;
  public textureBasePath: string = ''; // Base path for texture loading

  constructor(assetId: string, textureBasePath: string = '') {
    super(PMXMeshComponent.componentName);
    this.assetId = assetId;
    this.textureBasePath = textureBasePath;
  }

  /**
   * Resolve asset reference from registry
   */
  resolveAsset(): AssetDescriptor<AssetType> | null {
    if (!this.assetDescriptor) {
      this.assetDescriptor = assetRegistry.getAssetDescriptor(this.assetId) || null;
      if (this.assetDescriptor) {
        assetRegistry.addRef(this.assetId);
      }
    }
    return this.assetDescriptor;
  }

  /**
   * Release asset reference
   */
  releaseAsset(): void {
    if (this.assetDescriptor) {
      assetRegistry.releaseRef(this.assetId);
      this.assetDescriptor = null;
      this.gpuResource = null;
    }
  }

  /**
   * Get asset CPU data (PMX model data)
   */
  getAssetData(): unknown | null {
    const descriptor = this.resolveAsset();
    return descriptor?.rawData || null;
  }

  /**
   * Get PMX model data with type safety
   */
  getPMXModelData(): PMXModel | null {
    const data = this.getAssetData();
    return data as PMXModel | null;
  }

  /**
   * Check if the model is loaded and ready for rendering
   */
  isLoaded(): boolean {
    return this.assetDescriptor !== null;
  }

  /**
   * Set GPU resource (called by renderer)
   */
  setGPUResource(gpuResource: unknown): void {
    this.gpuResource = gpuResource;
  }

  /**
   * Get GPU resource
   */
  getGPUResource(): unknown | null {
    return this.gpuResource;
  }

  /**
   * Set texture base path
   */
  setTextureBasePath(path: string): void {
    this.textureBasePath = path;
  }

  /**
   * Clone the component
   */
  clone(): PMXMeshComponent {
    const cloned = new PMXMeshComponent(this.assetId);
    cloned.assetDescriptor = this.assetDescriptor;
    cloned.gpuResource = this.gpuResource;
    cloned.visible = this.visible;
    cloned.castShadow = this.castShadow;
    cloned.receiveShadow = this.receiveShadow;
    cloned.layer = this.layer;
    return cloned;
  }
}
