import { VertexFormat } from '@ecs';
import { AssetDescriptor } from './AssetRegistry';
import { BufferManager } from './BufferManager';
import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { GeometryManager } from './GeometryManager';
import { MaterialManager } from './MaterialManager';
import { TextureManager } from './TextureManager';

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

  /**
   * Get or create GPU resource for an asset
   * This coordinates with specialized managers rather than creating resources directly
   */
  async getOrCreateGPUResource(
    assetDescriptor: AssetDescriptor,
    urgency: 'immediate' | 'high' | 'normal' | 'low' = 'normal',
  ): Promise<unknown> {
    const assetType = assetDescriptor.type;

    switch (assetType) {
      case 'pmx_model':
        return this.createPMXGeometry(assetDescriptor);
      case 'texture':
        return this.createTexture(assetDescriptor);
      case 'material':
        return this.createMaterial(assetDescriptor);
      default:
        console.warn(`[GPUResourceCoordinator] Unsupported asset type: ${assetType}`);
        return null;
    }
  }

  /**
   * Create PMX geometry using GeometryManager
   */
  private async createPMXGeometry(assetDescriptor: AssetDescriptor): Promise<unknown> {
    const pmxData = assetDescriptor.cpuData as Record<string, unknown>;
    const assetId = assetDescriptor.id;

    // Convert PMX data to geometry data format
    const geometryData = this.convertPMXToGeometryData(pmxData);

    // Use GeometryManager to create the actual GPU geometry
    return this.geometryManager.getGeometryFromData(geometryData, assetId);
  }

  /**
   * Create texture using TextureManager
   */
  private async createTexture(assetDescriptor: AssetDescriptor): Promise<unknown> {
    const image = assetDescriptor.cpuData as HTMLImageElement;
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
  private async createMaterial(assetDescriptor: AssetDescriptor): Promise<unknown> {
    const materialData = assetDescriptor.cpuData as Record<string, unknown>;
    const assetId = assetDescriptor.id;

    // Use MaterialManager to create the actual GPU material
    // Note: This might need proper material descriptor conversion
    return this.materialManager.createMaterial(assetId, materialData as any);
  }

  /**
   * Convert PMX model data to GeometryData format
   */
  private convertPMXToGeometryData(pmxModel: Record<string, unknown>): {
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

    // Calculate bounds
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    // Convert vertices - based on actual PMX data structure
    const pmxVertices = pmxModel.vertices as Array<Record<string, unknown>>;

    // Process vertices

    for (const vertex of pmxVertices) {
      // Safely get vertex attributes with default values
      const position = (vertex.position as [number, number, number]) || [0, 0, 0];
      const normal = (vertex.normal as [number, number, number]) || [0, 1, 0];
      const uv = (vertex.uv as [number, number]) || [0, 0];

      // Use correct property names: skinIndices and skinWeights
      const skinIndices = (vertex.skinIndices as [number, number, number, number]) || [0, 0, 0, 0];
      const skinWeights = (vertex.skinWeights as [number, number, number, number]) || [1, 0, 0, 0];

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

      // Update bounds
      minX = Math.min(minX, position[0]);
      minY = Math.min(minY, position[1]);
      minZ = Math.min(minZ, position[2]);
      maxX = Math.max(maxX, position[0]);
      maxY = Math.max(maxY, position[1]);
      maxZ = Math.max(maxZ, position[2]);
    }

    // Convert faces (indices) - handle faces array
    const pmxFaces = pmxModel.faces as Array<unknown>;

    // Process faces

    for (let i = 0; i < pmxFaces.length; i++) {
      // Each face object contains an indices array with 3 vertex indices
      const face = pmxFaces[i] as Record<string, unknown>;
      const faceIndices = face.indices as [number, number, number];

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
      vertexCount: vertices.length / 16, // 16 floats per vertex
      indexCount: indices.length,
      primitiveType: 'triangle-list',
      vertexFormat: 'pmx', // PMX format with skinning data
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    };
  }
}
