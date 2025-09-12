import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { Parser } from 'mmd-parser';
import {
  AssetDescriptor,
  AssetMetadata,
  assetRegistry,
  AssetType,
  RawDataType,
} from './AssetRegistry';

/**
 * Asset Loader - Centralized asset loading for the game engine
 * Only responsible for file loading and CPU data storage
 * Does NOT create GPU resources - that's handled by GPUResourceCoordinator
 */
export class AssetLoader {
  private static loadedAssets: Map<string, unknown> = new Map();

  private static parser = new Parser();

  /**
   * Initialize the asset loader
   * No longer needs GPU resource managers as dependencies
   */
  static initialize(): void {
    console.log('[AssetLoader] Initialized - CPU-only asset loading');
  }

  /**
   * Load PMX model from URL (for bundled assets)
   * @param url URL to the PMX file
   * @param assetId Unique identifier for the asset
   * @param priority Loading priority
   * @returns Promise that resolves when model is loaded
   */
  static async loadPMXModelFromURL(
    url: string,
    assetId: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    try {
      console.log(`[AssetLoader] Loading PMX model from URL: ${url}`);

      // Fetch the PMX file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PMX model: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const filename = url.split('/').pop() || 'model.pmx';
      const file = new File([arrayBuffer], filename, { type: 'application/octet-stream' });

      // Parse PMX file to CPU data
      const pmxData = await this.parsePMXFile(file);

      // Extract texture dependencies from PMX data
      const textureDependencies = this.extractTextureDependencies(pmxData);

      // Register with asset registry
      const metadata: AssetMetadata = {
        type: 'pmx_model',
        dependencies: textureDependencies,
        memorySize: arrayBuffer.byteLength,
      };

      assetRegistry.register(assetId, pmxData, metadata);

      // Pre-load texture dependencies
      await this.preloadTextureDependencies(textureDependencies, url);

      console.log(`[AssetLoader] Successfully loaded PMX model: ${assetId}`);
    } catch (error) {
      console.error(`[AssetLoader] Failed to load PMX model ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Load PMX model from File object (for user file selection)
   * @param file PMX file object
   * @param assetId Unique identifier for the asset
   * @param priority Loading priority
   * @returns Promise that resolves when model is loaded
   */
  static async loadPMXModelFromFile(
    file: File,
    assetId: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    try {
      console.log(`[AssetLoader] Loading PMX model from file: ${file.name}`);

      // Parse PMX file to CPU data
      const pmxData = await this.parsePMXFile(file);

      // Register with asset registry
      const metadata: AssetMetadata = {
        type: 'pmx_model',
        dependencies: [], // PMX models may have texture dependencies
        memorySize: file.size,
      };

      assetRegistry.register(assetId, pmxData, metadata);

      console.log(`[AssetLoader] Successfully loaded PMX model: ${assetId}`);
    } catch (error) {
      console.error(`[AssetLoader] Failed to load PMX model ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Load texture from URL (for bundled assets)
   * @param url URL to the texture file
   * @param assetId Unique identifier for the asset
   * @param priority Loading priority
   * @returns Promise that resolves when texture is loaded
   */
  static async loadTextureFromURL(
    url: string,
    assetId: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    try {
      console.log(`[AssetLoader] Loading texture from URL: ${url}`);

      // Load image
      const image = await this.loadImageFromURL(url);

      // Register with asset registry
      const metadata: AssetMetadata = {
        type: 'texture',
        dependencies: [],
        memorySize: image.width * image.height * 4, // RGBA
      };

      assetRegistry.register(assetId, image, metadata);

      console.log(`[AssetLoader] Successfully loaded texture: ${assetId}`);
    } catch (error) {
      console.error(`[AssetLoader] Failed to load texture ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Load texture from File object (for user file selection)
   * @param file Texture file object
   * @param assetId Unique identifier for the asset
   * @param priority Loading priority
   * @returns Promise that resolves when texture is loaded
   */
  static async loadTextureFromFile(
    file: File,
    assetId: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    try {
      console.log(`[AssetLoader] Loading texture from file: ${file.name}`);

      // Load image
      const image = await this.loadImageFromFile(file);

      // Register with asset registry
      const metadata: AssetMetadata = {
        type: 'texture',
        dependencies: [],
        memorySize: image.width * image.height * 4, // RGBA
      };

      assetRegistry.register(assetId, image, metadata);

      console.log(`[AssetLoader] Successfully loaded texture: ${assetId}`);
    } catch (error) {
      console.error(`[AssetLoader] Failed to load texture ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Load multiple assets in parallel
   * @param assets Array of asset loading tasks
   * @returns Promise that resolves when all assets are loaded
   */
  static async loadAssets(assets: AssetLoadingTask[]): Promise<void> {
    console.log(`[AssetLoader] Loading ${assets.length} assets in parallel`);

    const loadPromises = assets.map(async (asset) => {
      try {
        switch (asset.type) {
          case 'pmx_model_url':
            await this.loadPMXModelFromURL(asset.url, asset.assetId, asset.priority);
            break;
          case 'pmx_model_file':
            await this.loadPMXModelFromFile(asset.file, asset.assetId, asset.priority);
            break;
          case 'texture_url':
            await this.loadTextureFromURL(asset.url, asset.assetId, asset.priority);
            break;
          case 'texture_file':
            await this.loadTextureFromFile(asset.file, asset.assetId, asset.priority);
            break;
          default:
            throw new Error(`Unknown asset type: ${(asset as AssetLoadingTask).type}`);
        }
      } catch (error) {
        console.error(`[AssetLoader] Failed to load asset ${asset.assetId}:`, error);
        throw error;
      }
    });

    await Promise.all(loadPromises);
    console.log(`[AssetLoader] Successfully loaded all ${assets.length} assets`);
  }

  /**
   * Load a single asset with priority
   * @param assetId Asset identifier
   * @param priority Loading priority
   * @returns Promise that resolves when asset is loaded
   */
  static async loadAsset(
    assetId: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    // This is a placeholder - in a real implementation, this would
    // look up the asset configuration and load it accordingly
    console.log(`[AssetLoader] Loading asset: ${assetId} with priority: ${priority}`);
  }

  /**
   * Parse PMX file to CPU data
   * @param file PMX file
   * @returns Parsed PMX data
   */
  private static async parsePMXFile(file: File): Promise<PMXModel> {
    try {
      const arrayBuffer = await file.arrayBuffer();

      // Parse PMX file using mmd-parser
      const pmxData = this.parser.parsePmx(arrayBuffer) as PMXModel;

      return pmxData;
    } catch (error) {
      console.error('[AssetLoader] Failed to parse PMX file:', error);
      throw new Error('Invalid PMX file format');
    }
  }

  /**
   * Get loaded asset by ID from registry
   * @param assetId Asset identifier
   * @returns Asset descriptor or undefined
   */
  static getAsset<T extends AssetType>(assetId: string): AssetDescriptor<T> | undefined {
    return assetRegistry.getAssetDescriptor(assetId) as AssetDescriptor<T> | undefined;
  }

  /**
   * Get asset CPU data by ID
   * @param assetId Asset identifier
   * @returns Asset CPU data or undefined
   */
  static getAssetData<T extends AssetType>(assetId: string): RawDataType<T> | undefined {
    return assetRegistry.getAssetData(assetId) as RawDataType<T> | undefined;
  }

  /**
   * Get all loaded assets from registry
   * @returns Array of all asset descriptors
   */
  static getAllAssets(): AssetDescriptor<AssetType>[] {
    return assetRegistry.getAllAssets() as AssetDescriptor<AssetType>[];
  }

  /**
   * Get assets by type from registry
   * @param type Asset type
   * @returns Array of assets of the specified type
   */
  static getAssetsByType<T extends AssetType>(type: T): AssetDescriptor<T>[] {
    return assetRegistry.getAssetsByType(type);
  }

  /**
   * Clear all loaded assets
   */
  static clearAssets(): void {
    assetRegistry.clearAssets();
    this.loadedAssets.clear();
    console.log('[AssetLoader] Cleared all assets');
  }

  /**
   * Get asset loading statistics
   * @returns Asset statistics
   */
  static getAssetStats(): AssetStats {
    const memoryStats = assetRegistry.getMemoryStats();
    return {
      total: memoryStats.assetCount,
      byType: memoryStats.byType,
      memoryUsage: memoryStats.totalMemory,
    };
  }

  /**
   * Load image from URL
   */
  private static async loadImageFromURL(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

      img.src = url;
    });
  }

  /**
   * Load image from File object
   */
  private static async loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));

      const url = URL.createObjectURL(file);
      img.src = url;

      // Clean up object URL after loading
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
    });
  }

  /**
   * Extract texture dependencies from PMX model data
   */
  private static extractTextureDependencies(pmxData: PMXModel): string[] {
    const dependencies: string[] = [];

    if (pmxData.textures && Array.isArray(pmxData.textures)) {
      for (const texture of pmxData.textures) {
        if (texture && texture.path) {
          dependencies.push(texture.path);
        }
      }
    }

    return dependencies;
  }

  /**
   * Pre-load texture dependencies
   */
  private static async preloadTextureDependencies(
    texturePaths: string[],
    baseUrl: string,
  ): Promise<void> {
    const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

    for (const texturePath of texturePaths) {
      try {
        const fullUrl = basePath + texturePath;
        const textureId = `texture_${texturePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Load texture as separate asset
        await this.loadTextureFromURL(fullUrl, textureId);
      } catch (error) {
        console.warn(`[AssetLoader] Failed to pre-load texture ${texturePath}:`, error);
      }
    }
  }
}

/**
 * Asset loading task types
 */
export type AssetLoadingTask =
  | {
      type: 'pmx_model_url';
      url: string;
      assetId: string;
      priority?: 'low' | 'normal' | 'high';
    }
  | {
      type: 'pmx_model_file';
      file: File;
      assetId: string;
      priority?: 'low' | 'normal' | 'high';
    }
  | {
      type: 'texture_url';
      url: string;
      assetId: string;
      priority?: 'low' | 'normal' | 'high';
    }
  | {
      type: 'texture_file';
      file: File;
      assetId: string;
      priority?: 'low' | 'normal' | 'high';
    };

/**
 * Asset statistics
 */
export interface AssetStats {
  total: number;
  byType: Record<AssetType, number>;
  memoryUsage: number;
}
