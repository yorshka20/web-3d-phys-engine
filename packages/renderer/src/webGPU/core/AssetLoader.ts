import { GeometryData, VertexFormat } from '@ecs/components/physics/mesh/GeometryFactory';
import { GLTFModel, GLTFPrimitive } from '@ecs/components/physics/mesh/GltfModel';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { Document, Primitive, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
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
          case 'gltf_model_url': {
            const a = asset as unknown as {
              url: string;
              assetId: string;
              priority?: 'low' | 'normal' | 'high';
            };
            await this.loadGLTFModelFromURL(a.url, a.assetId, a.priority);
            break;
          }
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
   * Load GLTF/GLB model from URL and parse into CPU-side GeometryData arrays.
   * This does not create any GPU resources; it only registers CPU data.
   */
  static async loadGLTFModelFromURL(
    url: string,
    assetId: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    try {
      console.log(`[AssetLoader] Loading GLTF model from URL: ${url}`);
      const io = new WebIO();

      // Register extensions to support texture transforms
      io.registerExtensions(ALL_EXTENSIONS);

      const doc: Document = await io.read(url);

      const meshes = doc.getRoot().listMeshes();
      const dependencies: string[] = [];
      const primitives: GLTFPrimitive[] = [];

      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const cpuPrim = this.convertGLTFPrimitiveToGeometry(primitive);
          // collect baseColor texture dependency if exists
          const material = primitive.getMaterial();
          if (material) {
            const tex = material.getBaseColorTexture();
            if (tex) {
              const image: unknown = (tex as unknown as { getImage?: () => unknown }).getImage?.();
              const uriGetter = (image as unknown as { getURI?: () => string }).getURI;
              const uri = typeof uriGetter === 'function' ? uriGetter.call(image) : undefined;
              if (typeof uri === 'string' && uri.length > 0) {
                dependencies.push(uri);
                cpuPrim.material = { baseColorTexture: uri };
              }
            }
          }
          primitives.push(cpuPrim);
        }
      }

      // Register GLTF model as a CPU asset
      const metadata: AssetMetadata = {
        type: 'gltf',
        dependencies,
      };

      const model: GLTFModel = { primitives };
      assetRegistry.register(assetId, model, metadata);

      // Load textures referenced by the model (best-effort)
      await this.loadTexturesForGLTF(dependencies);

      console.log(`[AssetLoader] Successfully loaded GLTF model: ${assetId}`);
    } catch (error) {
      console.error(`[AssetLoader] Failed to load GLTF model ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Convert a glTF primitive to our interleaved GeometryData (pos+normal+uv) format.
   */
  private static convertGLTFPrimitiveToGeometry(primitive: Primitive): GLTFPrimitive {
    const position = primitive.getAttribute('POSITION');
    if (!position) {
      throw new Error('GLTF primitive missing POSITION attribute');
    }

    const normal = primitive.getAttribute('NORMAL');
    const uv0 = primitive.getAttribute('TEXCOORD_0');
    const uv1 = primitive.getAttribute('TEXCOORD_1');
    const color = primitive.getAttribute('COLOR_0');
    const joints = primitive.getAttribute('JOINTS_0');
    const weights = primitive.getAttribute('WEIGHTS_0');
    const tangent = primitive.getAttribute('TANGENT');
    const indices = primitive.getIndices();

    // Get arrays
    const posArr = new Float32Array(position.getArray() as ArrayLike<number>);
    const normalArr = normal ? new Float32Array(normal.getArray() as ArrayLike<number>) : null;
    const uv0Arr = uv0 ? new Float32Array(uv0.getArray() as ArrayLike<number>) : null;
    const uv1Arr = uv1 ? new Float32Array(uv1.getArray() as ArrayLike<number>) : null;
    const colorArr = color ? new Float32Array(color.getArray() as ArrayLike<number>) : null;
    const jointsArr = joints ? new Uint32Array(joints.getArray() as ArrayLike<number>) : null;
    const weightsArr = weights ? new Float32Array(weights.getArray() as ArrayLike<number>) : null;
    const tangentArr = tangent ? new Float32Array(tangent.getArray() as ArrayLike<number>) : null;
    const indexArr = indices
      ? new Uint16Array(indices.getArray() as ArrayLike<number>)
      : new Uint16Array([]);

    const vertexCount = posArr.length / 3;

    // Calculate vertex stride for GLTF format
    // GLTF vertex layout: pos(3) + normal(3) + uv0(2) + uv1(2) + color(4) + joints(4) + weights(4) + tangent(4)
    // All attributes must be present with default values if not provided
    const stride = 3 + 3 + 2 + 2 + 4 + 4 + 4 + 4; // Total: 26 floats per vertex

    const vertices = new Float32Array(vertexCount * stride);

    for (let i = 0; i < vertexCount; i++) {
      const pi = i * 3;
      const ui = i * 2;
      const ci = i * 4;
      let vi = i * stride;

      // Position (3 floats) - always present
      vertices[vi++] = posArr[pi];
      vertices[vi++] = posArr[pi + 1];
      vertices[vi++] = posArr[pi + 2];

      // Normal (3 floats) - use actual data or default (0, 1, 0)
      if (normalArr) {
        vertices[vi++] = normalArr[pi];
        vertices[vi++] = normalArr[pi + 1];
        vertices[vi++] = normalArr[pi + 2];
      } else {
        vertices[vi++] = 0.0;
        vertices[vi++] = 1.0;
        vertices[vi++] = 0.0;
      }

      // UV0 (2 floats) - use actual data or default (0, 0)
      if (uv0Arr) {
        vertices[vi++] = uv0Arr[ui];
        vertices[vi++] = uv0Arr[ui + 1];
      } else {
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
      }

      // UV1 (2 floats) - use actual data or default (0, 0)
      if (uv1Arr) {
        vertices[vi++] = uv1Arr[ui];
        vertices[vi++] = uv1Arr[ui + 1];
      } else {
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
      }

      // Color (4 floats) - use actual data or default (1, 1, 1, 1)
      if (colorArr) {
        const colorStride = colorArr.length / vertexCount;
        if (colorStride === 3) {
          vertices[vi++] = colorArr[ci];
          vertices[vi++] = colorArr[ci + 1];
          vertices[vi++] = colorArr[ci + 2];
          vertices[vi++] = 1.0; // default alpha
        } else if (colorStride === 4) {
          vertices[vi++] = colorArr[ci];
          vertices[vi++] = colorArr[ci + 1];
          vertices[vi++] = colorArr[ci + 2];
          vertices[vi++] = colorArr[ci + 3];
        } else {
          vertices[vi++] = 1.0;
          vertices[vi++] = 1.0;
          vertices[vi++] = 1.0;
          vertices[vi++] = 1.0;
        }
      } else {
        vertices[vi++] = 1.0;
        vertices[vi++] = 1.0;
        vertices[vi++] = 1.0;
        vertices[vi++] = 1.0;
      }

      // Joints (4 floats) - use actual data or default (0, 0, 0, 0)
      if (jointsArr) {
        vertices[vi++] = jointsArr[ci] || 0;
        vertices[vi++] = jointsArr[ci + 1] || 0;
        vertices[vi++] = jointsArr[ci + 2] || 0;
        vertices[vi++] = jointsArr[ci + 3] || 0;
      } else {
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
      }

      // Weights (4 floats) - use actual data or default (1, 0, 0, 0)
      if (weightsArr) {
        vertices[vi++] = weightsArr[ci] || 0;
        vertices[vi++] = weightsArr[ci + 1] || 0;
        vertices[vi++] = weightsArr[ci + 2] || 0;
        vertices[vi++] = weightsArr[ci + 3] || 0;
      } else {
        vertices[vi++] = 1.0;
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
      }

      // Tangent (4 floats) - use actual data or default (1, 0, 0, 1)
      if (tangentArr) {
        vertices[vi++] = tangentArr[ci] || 1;
        vertices[vi++] = tangentArr[ci + 1] || 0;
        vertices[vi++] = tangentArr[ci + 2] || 0;
        vertices[vi++] = tangentArr[ci + 3] || 1; // handedness
      } else {
        vertices[vi++] = 1.0;
        vertices[vi++] = 0.0;
        vertices[vi++] = 0.0;
        vertices[vi++] = 1.0;
      }
    }

    // Calculate bounds
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < posArr.length; i += 3) {
      const x = posArr[i];
      const y = posArr[i + 1];
      const z = posArr[i + 2];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    // Determine vertex format based on available attributes
    // GLTF models should use 'gltf' format to support all GLTF vertex attributes
    const vertexFormat: VertexFormat = 'gltf';

    // GLTF format always includes all vertex attributes (with defaults if not provided)
    // Set all GLTF vertex attribute flags
    const vertexAttributes = 0x01 | 0x02 | 0x04 | 0x40 | 0x08 | 0x10 | 0x80; // All GLTF attributes

    const geometry: GeometryData = {
      vertices,
      indices: indexArr,
      vertexCount,
      indexCount: indexArr.length,
      vertexFormat,
      primitiveType: 'triangle-list',
      bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      // Add vertex attributes for pipeline creation
      vertexAttributes,
    };

    return { geometry };
  }

  /**
   * Load textures referenced by a GLTF model URIs.
   */
  private static async loadTexturesForGLTF(textureUris: string[]): Promise<void> {
    const unique = Array.from(new Set(textureUris));
    const tasks = unique.map(async (uri) => {
      try {
        await this.loadTextureFromURL(uri, uri);
      } catch (e) {
        console.warn('[AssetLoader] Failed to load GLTF texture:', uri, e);
      }
    });
    await Promise.all(tasks);
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
    }
  | {
      type: 'gltf_model_url';
      url: string;
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
