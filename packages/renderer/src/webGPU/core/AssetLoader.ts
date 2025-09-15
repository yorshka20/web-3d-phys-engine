import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { mat4 } from 'gl-matrix';
import { Parser } from 'mmd-parser';
import {
  AssetDescriptor,
  AssetMetadata,
  assetRegistry,
  AssetType,
  RawDataType,
} from './AssetRegistry';
import { pmxAssetRegistry } from './PMXAssetRegistry';

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

      // Get texture dependencies from PMXAssetRegistry descriptor instead of PMX file
      const descriptor = pmxAssetRegistry.getDescriptor(assetId);
      let textureDependencies: string[] = [];

      if (descriptor) {
        // Use descriptor-defined texture paths
        textureDependencies = pmxAssetRegistry.getAllTexturePaths(assetId);
      } else {
        // Fallback to PMX file texture dependencies
        textureDependencies = this.extractTextureDependencies(pmxData);
      }

      // Register with asset registry
      const metadata: AssetMetadata = {
        type: 'pmx_model',
        dependencies: textureDependencies,
        memorySize: arrayBuffer.byteLength,
      };

      assetRegistry.register(assetId, pmxData, metadata);

      // Load textures after PMX model is registered
      await this.loadTexturesForModel(textureDependencies, assetId);

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
   * Parse PMX file to CPU data
   * @param file PMX file
   * @returns Parsed PMX data
   */
  private static async parsePMXFile(file: File): Promise<PMXModel> {
    try {
      const arrayBuffer = await file.arrayBuffer();

      // Parse PMX file using mmd-parser
      const pmxData = this.parser.parsePmx(arrayBuffer) as PMXModel;

      // transform PMX coordinates
      this.transformPMXCoordinates(pmxData);

      return pmxData;
    } catch (error) {
      console.error('[AssetLoader] Failed to parse PMX file:', error);
      throw new Error('Invalid PMX file format');
    }
  }

  private static transformPMXCoordinates(pmxData: PMXModel): void {
    // 1. vertex position and normal
    if (pmxData.vertices) {
      for (const vertex of pmxData.vertices) {
        if (vertex.position) {
          vertex.position[2] = -vertex.position[2]; // flip Z axis
        }
        if (vertex.normal) {
          vertex.normal[2] = -vertex.normal[2]; // flip normal Z axis
        }
      }
    }

    // bone position and tail position
    if (pmxData.bones) {
      for (const bone of pmxData.bones) {
        // convert bone position
        if (bone.position) {
          bone.position[2] = -bone.position[2];
        }

        // convert bone tail position
        if (bone.tailPosition) {
          bone.tailPosition[2] = -bone.tailPosition[2];
        }

        // convert bone offset position
        if (bone.offsetPosition) {
          bone.offsetPosition[2] = -bone.offsetPosition[2];
        }

        // convert bone transform matrix (if exists)
        if (bone.transform) {
          this.transformBoneMatrix(bone.transform);
        }

        // convert inverse bind matrix (for skinning)
        if (bone.inverseBindMatrix) {
          this.transformBoneMatrix(bone.inverseBindMatrix);
        }
      }
    }

    if (pmxData.morphs) {
      for (const morph of pmxData.morphs) {
        if (morph.type === 1) {
          // vertex morph
          for (const element of morph.elements) {
            if (element.offset) {
              element.offset[2] = -element.offset[2]; // flip Z axis offset
            }
          }
        } else if (morph.type === 2) {
          // bone morph
          for (const element of morph.elements) {
            if (element.position) {
              element.position[2] = -element.position[2]; // flip position offset
            }
          }
        }
      }
    }

    // 4. other data that needs to be converted (rigid bodies, joints, etc.)
    if (pmxData.rigidBodies) {
      for (const rigidBody of pmxData.rigidBodies) {
        if (rigidBody.position) {
          rigidBody.position[2] = -rigidBody.position[2];
        }
        if (rigidBody.rotation) {
          rigidBody.rotation[2] = -rigidBody.rotation[2];
        }
      }
    }
  }

  // transform 4x4 matrix's Z axis related components
  private static transformBoneMatrix(matrix: mat4): void {
    // matrix is 16 element array stored in row-major or column-major
    // assume it is column-major (OpenGL/WebGPU standard):
    // [0  4  8  12]   [M00 M01 M02 M03]
    // [1  5  9  13] = [M10 M11 M12 M13]
    // [2  6  10 14]   [M20 M21 M22 M23]
    // [3  7  11 15]   [M30 M31 M32 M33]

    // flip Z axis related matrix elements
    matrix[8] = -matrix[8]; // M02 (column 3, row 1)
    matrix[9] = -matrix[9]; // M12 (column 3, row 2)
    matrix[10] = -matrix[10]; // M22 (column 3, row 3)
    matrix[11] = -matrix[11]; // M32 (column 3, row 4)

    // flip Z axis related translation components
    matrix[14] = -matrix[14]; // M23 (Z axis translation)
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
   * Load textures for a specific model
   */
  private static async loadTexturesForModel(
    texturePaths: string[],
    modelId: string,
  ): Promise<void> {
    console.log(`[AssetLoader] Loading ${texturePaths.length} textures for model: ${modelId}`);

    // Load all textures in parallel for better performance
    const loadPromises = texturePaths.map(async (texturePath) => {
      try {
        // Check if this is a namespaced path (from descriptor)
        if (texturePath.includes('/') && texturePath.startsWith(`${modelId}/`)) {
          // This is a namespaced path from descriptor, extract original path
          const originalPath = texturePath.substring(modelId.length + 1);

          // Get URL from PMXAssetRegistry
          const textureUrl = pmxAssetRegistry.getTextureUrl(modelId, originalPath);

          if (!textureUrl) {
            console.warn(
              `[AssetLoader] No URL found for texture: ${originalPath} (model: ${modelId})`,
            );
            return;
          }

          // Load texture with namespaced ID
          await this.loadTextureFromURL(textureUrl, texturePath);
        } else {
          // This is a regular path from PMX file, try to get URL from textureUrlMap first
          const textureUrl = pmxAssetRegistry.getTextureUrl(modelId, texturePath);
          const namespacedId = `${modelId}/${texturePath}`;

          if (textureUrl) {
            // Use URL from textureUrlMap (handles Chinese characters correctly)
            await this.loadTextureFromURL(textureUrl, namespacedId);
          } else {
            // Fallback: construct URL from base path
            const basePath = `/assets/${modelId}/`;
            const fallbackUrl = basePath + texturePath;
            await this.loadTextureFromURL(fallbackUrl, namespacedId);
          }
        }
      } catch (error) {
        console.error(`[AssetLoader] Failed to load texture ${texturePath}:`, error);
      }
    });

    // Wait for all textures to load
    await Promise.all(loadPromises);
    console.log(`[AssetLoader] All textures loaded for model: ${modelId}`);
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
