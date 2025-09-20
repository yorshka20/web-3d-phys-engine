import { VertexFormat, WebGPUMaterialDescriptor } from '@ecs';
import { PMXModel, PMXVertex } from '@ecs/components/physics/mesh/PMXModel';
import { AssetDescriptor, AssetType } from './AssetRegistry';
import { BufferManager } from './BufferManager';
import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { GeometryManager } from './GeometryManager';
import { MaterialManager } from './MaterialManager';
import { pmxAssetRegistry } from './PMXAssetRegistry';
import { PMXMaterialCacheData, PMXMaterialProcessor } from './PMXMaterialProcessor';
import { TextureManager } from './TextureManager';
import { ResourceType } from './types/constant';
import { GeometryCacheItem } from './types/geometry';

// GPU resource return types based on asset type
type GPUResourceType<T extends AssetType> = T extends 'pmx_model'
  ? GeometryCacheItem // Geometry cache item
  : T extends 'pmx_material'
    ? PMXMaterialCacheData[] // Array of processed PMX materials
    : T extends 'texture'
      ? GPUTexture
      : T extends 'material'
        ? WebGPUMaterialDescriptor
        : unknown;

// GPU resource descriptor
interface GPUResourceDescriptor<T extends AssetType = AssetType> {
  assetDescriptor: AssetDescriptor<T>;
  urgency?: 'immediate' | 'high' | 'normal' | 'low';
}

/**
 * GPU Resource Coordinator - Coordinates GPU resource creation across specialized managers
 * This follows the design principle of separation of concerns:
 * - Specialized managers handle specific resource types
 * - Coordinator handles cross-cutting concerns (caching, memory management, lifecycle)
 */
@Injectable(ServiceTokens.GPU_RESOURCE_COORDINATOR, {
  lifecycle: 'singleton',
})
export class GPUResourceCoordinator {
  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  @Inject(ServiceTokens.TEXTURE_MANAGER)
  private textureManager!: TextureManager;

  @Inject(ServiceTokens.GEOMETRY_MANAGER)
  private geometryManager!: GeometryManager;

  @Inject(ServiceTokens.MATERIAL_MANAGER)
  private materialManager!: MaterialManager;

  @Inject(ServiceTokens.PMX_MATERIAL_PROCESSOR)
  private pmxMaterialProcessor!: PMXMaterialProcessor;

  // PMX Asset Registry for managing model descriptors
  private pmxAssetRegistry = pmxAssetRegistry;

  /**
   * Get or create GPU resource for an asset
   * This coordinates with specialized managers rather than creating resources directly
   */
  @SmartResource(ResourceType.GPU_RESOURCE, {
    cache: true,
    lifecycle: 'persistent',
  })
  async createGPUResource<T extends AssetType>(
    label: string,
    descriptor: GPUResourceDescriptor<T>,
  ): Promise<GPUResourceType<T> | null> {
    const { assetDescriptor, urgency = 'normal' } = descriptor;
    const assetType = assetDescriptor.type;

    switch (assetType) {
      case 'pmx_model':
        return this.createPMXGeometryForRenderPass(
          assetDescriptor as AssetDescriptor<'pmx_model'>,
        ) as GPUResourceType<T>;
      case 'pmx_material':
        return this.createPMXMaterial(
          assetDescriptor as AssetDescriptor<'pmx_material'>,
        ) as GPUResourceType<T>;
      case 'texture':
        return this.createTexture(
          assetDescriptor as AssetDescriptor<'texture'>,
        ) as GPUResourceType<T>;
      case 'material':
        return this.createMaterial(
          assetDescriptor as AssetDescriptor<'material'>,
        ) as GPUResourceType<T>;
      default:
        console.warn(`[GPUResourceCoordinator] Unsupported asset type: ${assetType}`);
        return null;
    }
  }

  async createPMXGeometryForRenderPass(assetDescriptor: AssetDescriptor<'pmx_model'>) {
    const pmxData = assetDescriptor.rawData;
    const assetId = assetDescriptor.id;

    const geometryData = this.convertPMXToGeometryData(assetId, pmxData);

    return this.geometryManager.createGeometryFromData(assetId, { geometryData });
  }

  /**
   * Create PMX geometry using GeometryManager
   */
  async createPMXGeometryForComputePass(assetDescriptor: AssetDescriptor<'pmx_model'>) {
    const pmxData = assetDescriptor.rawData;
    const assetId = assetDescriptor.id;

    // Convert PMX data to geometry data format
    const geometryData = this.convertPMXToGeometryData(assetId, pmxData);

    // Use GeometryManager to create the actual GPU geometry
    const computeBuffer = this.bufferManager.createStorageBuffer(`${assetId}_compute_buffer`, {
      data: geometryData.vertices.buffer as ArrayBuffer,
    });

    return computeBuffer;
  }

  /**
   * Create texture using TextureManager
   */
  private async createTexture(assetDescriptor: AssetDescriptor<'texture'>) {
    const image = assetDescriptor.rawData;
    const assetId = assetDescriptor.id;

    // Use TextureManager to create the actual GPU texture
    return this.textureManager.createTexture(assetId, {
      id: assetId,
      width: image.width,
      height: image.height,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      initialData: image,
    });
  }

  /**
   * Create material using MaterialManager
   */
  private async createMaterial(assetDescriptor: AssetDescriptor<'material'>) {
    const assetId = assetDescriptor.id;
    const materialData = assetDescriptor.rawData;

    return this.materialManager.createMaterial(assetId, materialData);
  }

  /**
   * Create PMX materials with texture loading using PMXMaterialProcessor
   */
  private async createPMXMaterial(assetDescriptor: AssetDescriptor<'pmx_material'>) {
    const pmxData = assetDescriptor.rawData;
    const assetId = assetDescriptor.id;

    // Extract materials and textures from PMX data
    const materials = pmxData.materials;
    const textures = pmxData.textures;

    if (!materials || materials.length === 0) {
      throw new Error('No materials found in PMX data');
    }

    if (!textures || textures.length === 0) {
      console.warn(`No textures found in PMX data for ${assetId}`);
    }

    // Get PMX asset descriptor from PMXAssetRegistry
    const pmxAssetDescriptor = this.pmxAssetRegistry.getDescriptor(assetId);
    if (!pmxAssetDescriptor) {
      throw new Error(`No PMX asset descriptor found for model: ${assetId}`);
    }

    // Use PMXMaterialProcessor to process all materials with explicit mapping
    const processedMaterials = await this.pmxMaterialProcessor.processPMXMaterials(
      materials,
      textures || [],
      assetId,
      pmxAssetDescriptor,
    );

    console.log(
      `[GPUResourceCoordinator] Processed ${processedMaterials.length} PMX materials for ${assetId}`,
    );
    return processedMaterials;
  }

  /**
   * Convert PMX model data to GeometryData format
   */
  @SmartResource(ResourceType.GEOMETRY, {
    cache: true,
    lifecycle: 'persistent',
  })
  private convertPMXToGeometryData(
    label: string, // for caching
    pmxModel: PMXModel,
  ): {
    vertices: Float32Array;
    indices: Uint16Array;
    vertexCount: number;
    indexCount: number;
    primitiveType: 'triangle-list';
    vertexFormat: VertexFormat;
    bounds: {
      min: [number, number, number];
      max: [number, number, number];
    };
  } {
    const vertices: number[] = [];
    const indices: number[] = [];

    // define vertex format constants
    const VERTEX_FORMAT = {
      POSITION_SIZE: 3, // vec3<f32>
      NORMAL_SIZE: 3, // vec3<f32>
      UV_SIZE: 2, // vec2<f32>
      SKIN_INDICES_SIZE: 4, // vec4<f32>
      SKIN_WEIGHTS_SIZE: 4, // vec4<f32>
      EDGE_RATIO_SIZE: 1, // f32
    } as const;

    // calculate the total number of floats per vertex
    const FLOATS_PER_VERTEX =
      VERTEX_FORMAT.POSITION_SIZE +
      VERTEX_FORMAT.NORMAL_SIZE +
      VERTEX_FORMAT.UV_SIZE +
      VERTEX_FORMAT.SKIN_INDICES_SIZE +
      VERTEX_FORMAT.SKIN_WEIGHTS_SIZE +
      VERTEX_FORMAT.EDGE_RATIO_SIZE;

    // calculate the stride
    // const VERTEX_STRIDE = FLOATS_PER_VERTEX * 4; // 4 bytes per float

    // Calculate bounds
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    // Convert vertices - based on actual PMX data structure
    const pmxVertices = this.normalizeVertexData(pmxModel.vertices);

    // Process vertices

    for (const vertex of pmxVertices) {
      // Safely get vertex attributes with default values
      const position = vertex.position || [0, 0, 0];
      const normal = vertex.normal || [0, 1, 0];
      const uv = vertex.uv || [0, 0];
      const skinIndices = vertex.skinIndices;
      const skinWeights = vertex.skinWeights;
      const edgeRatio = vertex.edgeRatio;

      // Position (3 floats)
      vertices.push(position[0], position[1], position[2]);
      // Normal (3 floats)
      vertices.push(normal[0], normal[1], normal[2]);
      // UV coordinates (2 floats)
      vertices.push(uv[0], uv[1]);
      // Skin indices (4 floats)
      vertices.push(skinIndices[0], skinIndices[1], skinIndices[2], skinIndices[3]);
      // Skin weights (4 floats)
      vertices.push(skinWeights[0], skinWeights[1], skinWeights[2], skinWeights[3]);
      // Edge ratio (1 float)
      vertices.push(edgeRatio);

      // Update bounds
      minX = Math.min(minX, position[0]);
      minY = Math.min(minY, position[1]);
      minZ = Math.min(minZ, position[2]);
      maxX = Math.max(maxX, position[0]);
      maxY = Math.max(maxY, position[1]);
      maxZ = Math.max(maxZ, position[2]);
    }

    // Convert faces (indices) - handle faces array
    const pmxFaces = pmxModel.faces;

    // Process faces
    for (let i = 0; i < pmxFaces.length; i++) {
      // Each face object contains an indices array with 3 vertex indices
      const face = pmxFaces[i];
      const faceIndices = face.indices;

      if (faceIndices && faceIndices.length === 3) {
        const [idx1, idx2, idx3] = faceIndices;

        // PMX uses triangle faces, adjust vertex order to match WebGPU's counter-clockwise order
        indices.push(idx1, idx3, idx2);
      }
    }

    // Ensure indices array length is even for proper alignment
    // WebGPU requires buffer size to be multiple of 4 bytes
    // Uint16Array uses 2 bytes per element, so we need even number of elements
    if (indices.length % 2 !== 0) {
      indices.push(0); // Add padding index
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / FLOATS_PER_VERTEX, // 17 floats per vertex
      indexCount: indices.length,
      primitiveType: 'triangle-list',
      vertexFormat: 'pmx', // PMX format with skinning data
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    };
  }

  normalizeVertexData(vertices: PMXVertex[]): PMXVertex[] {
    return vertices.map((vertex) => {
      // uniform to 4 bones indices and weights
      const indices = [0, 0, 0, 0];
      const weights = [0, 0, 0, 0];

      switch (vertex.type) {
        case 0: // BDEF1
          indices[0] = vertex.skinIndices[0];
          weights[0] = 1.0;
          break;

        case 1: // BDEF2
          indices[0] = vertex.skinIndices[0];
          indices[1] = vertex.skinIndices[1];
          weights[0] = vertex.skinWeights[0];
          weights[1] = vertex.skinWeights[1];
          break;

        case 2: // BDEF4
          indices[0] = vertex.skinIndices[0];
          indices[1] = vertex.skinIndices[1];
          indices[2] = vertex.skinIndices[2];
          indices[3] = vertex.skinIndices[3];
          weights[0] = vertex.skinWeights[0];
          weights[1] = vertex.skinWeights[1];
          weights[2] = vertex.skinWeights[2];
          weights[3] = vertex.skinWeights[3];
          break;

        case 3: // SDEF - simplified to BDEF2
          indices[0] = vertex.skinIndices[0];
          indices[1] = vertex.skinIndices[1];
          weights[0] = vertex.skinWeights[0];
          weights[1] = vertex.skinWeights[1];
          break;
      }

      return {
        position: vertex.position,
        normal: vertex.normal,
        uv: vertex.uv,
        auvs: vertex.auvs,
        type: vertex.type,
        skinIndices: indices,
        skinWeights: weights,
        edgeRatio: vertex.edgeRatio,
      } as PMXVertex;
    });
  }
}
