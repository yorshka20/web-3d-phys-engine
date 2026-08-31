import { GLTFMaterial } from '@renderer/assets/GltfModel';
import { RenderData } from '@renderer/frame/types';
import { WebGPUMaterialDescriptor } from '@renderer/material/types';
import { assetRegistry } from './AssetRegistry';
import { BindGroupManager } from './BindGroupManager';
import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable } from './decorators/ResourceDecorators';
import { MaterialManager } from './MaterialManager';
import { WebGPUResourceManager } from './ResourceManager';
import { TextureManager } from './TextureManager';
import { BufferType } from './types';

// Bind groups shared by every draw with the same materialKey. Slot semantics follow the
// material family: regular = group2 textures + group3 material, glTF = group2 PBR material,
// PMX = group2 material + group3 animation.
export interface MaterialBindings {
  group2?: GPUBindGroup;
  group3?: GPUBindGroup;
}

/**
 * Material Binder
 *
 * Resolves the material-tier bind groups for a renderable, cached by RenderData.materialKey
 * (see docs/renderer-frame-contract.md). Handles the regular and GLTF material families; PMX
 * materials come pre-built from PMXMaterialProcessor and are assembled by the draw executor.
 */
@Injectable(ServiceTokens.MATERIAL_BINDER, {
  lifecycle: 'singleton',
})
export class MaterialBinder {
  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  @Inject(ServiceTokens.BIND_GROUP_MANAGER)
  private bindGroupManager!: BindGroupManager;

  @Inject(ServiceTokens.TEXTURE_MANAGER)
  private textureManager!: TextureManager;

  @Inject(ServiceTokens.MATERIAL_MANAGER)
  private materialManager!: MaterialManager;

  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  /**
   * Resolve the material bind groups for a non-PMX renderable (once per materialKey per frame)
   */
  async ensureMaterialBindings(renderable: RenderData): Promise<MaterialBindings> {
    if (renderable.material.materialType === 'gltf') {
      return { group2: await this.ensureGLTFMaterialBindGroup(renderable) };
    }
    return {
      group2: this.ensureTextureBindGroup(renderable) ?? undefined,
      group3: this.ensureRegularMaterialBindGroup(renderable) ?? undefined,
    };
  }

  /**
   * Get or create the GLTF PBR material bind group (group 2) and write its factor data
   */
  private async ensureGLTFMaterialBindGroup(renderable: RenderData): Promise<GPUBindGroup> {
    // Get GLTF PBR material bind group layout
    const gltfMaterialLayout = this.bindGroupManager.getBindGroupLayout(
      'gltfPbrMaterialBindGroupLayout',
    );
    if (!gltfMaterialLayout) {
      throw new Error('GLTF PBR material bind group layout not found');
    }

    // Create GLTF material bind group with PBR data and textures, cached by material identity
    const materialId = renderable.materialKey;

    // Create material uniform buffer for GLTF PBR material
    const materialBuffer = this.bufferManager.createCustomBuffer(`${materialId}_material_buffer`, {
      type: BufferType.UNIFORM,
      size: 64, // Size for GLTFPBRMaterial struct
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Get GLTF material from renderable
    const gltfMaterial = renderable.material as GLTFMaterial;

    // Get textures from material properties, fallback to defaults if not found
    const baseColorTexture = await this.getGLTFTexture(
      gltfMaterial.baseColorTexture,
      'gltf_default_white',
    );
    const metallicRoughnessTexture = await this.getGLTFTexture(
      gltfMaterial.metallicRoughnessTexture,
      'gltf_default_metallic_roughness',
    );
    const normalTexture = await this.getGLTFTexture(
      gltfMaterial.normalTexture,
      'gltf_default_normal',
    );
    const occlusionTexture = await this.getGLTFTexture(
      gltfMaterial.occlusionTexture,
      'gltf_default_occlusion',
    );
    const emissiveTexture = await this.getGLTFTexture(
      gltfMaterial.emissiveTexture,
      'gltf_default_emissive',
    );

    const gltfSampler = this.textureManager.getSampler('linear');

    if (
      !baseColorTexture ||
      !metallicRoughnessTexture ||
      !normalTexture ||
      !occlusionTexture ||
      !emissiveTexture ||
      !gltfSampler
    ) {
      throw new Error('GLTF textures or samplers not found');
    }

    // Create GLTF material bind group
    const gltfMaterialBindGroup = this.bindGroupManager.createBindGroup(materialId, {
      layout: gltfMaterialLayout,
      entries: [
        // Material uniforms (binding 0)
        { binding: 0, resource: { buffer: materialBuffer } },
        // Base color texture (binding 1)
        { binding: 1, resource: baseColorTexture.createView() },
        // Base color sampler (binding 2)
        { binding: 2, resource: gltfSampler },
        // Metallic roughness texture (binding 3)
        { binding: 3, resource: metallicRoughnessTexture.createView() },
        // Metallic roughness sampler (binding 4)
        { binding: 4, resource: gltfSampler },
        // Normal texture (binding 5)
        { binding: 5, resource: normalTexture.createView() },
        // Normal sampler (binding 6)
        { binding: 6, resource: gltfSampler },
        // Occlusion texture (binding 7)
        { binding: 7, resource: occlusionTexture.createView() },
        // Occlusion sampler (binding 8)
        { binding: 8, resource: gltfSampler },
        // Emissive texture (binding 9)
        { binding: 9, resource: emissiveTexture.createView() },
        // Emissive sampler (binding 10)
        { binding: 10, resource: gltfSampler },
      ],
      label: materialId,
    });

    // Update material buffer with GLTF PBR material data from renderable
    const materialData = new Float32Array(16); // 16 floats for GLTFPBRMaterial
    let offset = 0;

    // base_color_factor (4 floats) - with fallback to default values
    const baseColorFactor = gltfMaterial.baseColorFactor || [1.0, 1.0, 1.0, 1.0];
    materialData[offset++] = baseColorFactor[0];
    materialData[offset++] = baseColorFactor[1];
    materialData[offset++] = baseColorFactor[2];
    materialData[offset++] = baseColorFactor[3];

    // metallic_factor (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.metallicFactor ?? 0.0;

    // roughness_factor (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.roughnessFactor ?? 0.5;

    // normal_scale (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.normalScale ?? 1.0;

    // occlusion_strength (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.occlusionStrength ?? 1.0;

    // emissive_factor (3 floats) - with fallback to default values
    const emissiveFactor = gltfMaterial.emissiveFactor || [0.0, 0.0, 0.0];
    materialData[offset++] = emissiveFactor[0];
    materialData[offset++] = emissiveFactor[1];
    materialData[offset++] = emissiveFactor[2];

    // alpha_cutoff (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.alphaCutoff ?? 0.5;

    // padding (4 floats to align to 16-byte boundary)
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;

    // Write material data to buffer
    this.device.queue.writeBuffer(materialBuffer, 0, materialData);

    return gltfMaterialBindGroup;
  }

  /**
   * Helper method to get GLTF texture with fallback to default
   */
  private async getGLTFTexture(
    textureId: string | undefined,
    defaultTextureId: string,
  ): Promise<GPUTexture> {
    if (textureId) {
      // First check if GPU texture already exists in TextureManager
      let texture = this.textureManager.getTexture(textureId);
      if (texture) {
        return texture;
      }

      // Check if texture data exists in AssetRegistry
      const textureAsset = assetRegistry.getAssetDescriptor(textureId);
      if (textureAsset && textureAsset.rawData) {
        try {
          // Create GPU texture from AssetRegistry data
          const textureData = textureAsset.rawData;
          if (textureData instanceof ImageBitmap) {
            texture = this.textureManager.createTexture(textureId, {
              id: textureId,
              width: textureData.width,
              height: textureData.height,
              format: 'rgba8unorm',
              usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
              initialData: textureData,
            });

            console.log(`[MaterialBinder] Created GPU texture from AssetRegistry: ${textureId}`);
            return texture;
          }
        } catch (error) {
          console.warn(
            `[MaterialBinder] Failed to create GPU texture from AssetRegistry: ${textureId}`,
            error,
          );
        }
      }

      console.warn(
        `GLTF texture ${textureId} not found in AssetRegistry or TextureManager, using default ${defaultTextureId}`,
      );
    }

    const defaultTexture = this.textureManager.getTexture(defaultTextureId);
    if (!defaultTexture) {
      throw new Error(`Default GLTF texture ${defaultTextureId} not found`);
    }

    return defaultTexture;
  }

  /**
   * Get or create the texture bind group (group 2) for a regular material
   */
  private ensureTextureBindGroup(renderable: RenderData): GPUBindGroup | null {
    const regularMaterial = renderable.material as WebGPUMaterialDescriptor;
    const textureId = regularMaterial.albedoTextureId || regularMaterial.albedoTexture;

    // Always provide a texture bind group for regular materials, even if no specific texture
    if (!textureId) {
      // Use default white texture
      const defaultTexture = this.textureManager.getTexture('default_white_texture');
      if (!defaultTexture) {
        console.error('Default white texture not found');
        return null;
      }

      const sampler = this.textureManager.getSampler('linear');
      const textureBindGroupLayout =
        this.bindGroupManager.getBindGroupLayout('textureBindGroupLayout');
      if (!textureBindGroupLayout) {
        throw new Error('Texture bind group layout not found');
      }

      return this.bindGroupManager.createBindGroup('default_textureBindGroup', {
        layout: textureBindGroupLayout,
        entries: [
          { binding: 0, resource: defaultTexture.createView() },
          { binding: 1, resource: sampler },
        ],
        label: 'default_textureBindGroup',
      });
    }

    // Get or create texture
    let texture = this.textureManager.getTexture(textureId);
    if (!texture) {
      console.warn(`Texture ${textureId} not found, using default white texture`);
      // Use default white texture if the requested texture doesn't exist
      texture = this.textureManager.getTexture('default_white_texture');
      if (!texture) {
        console.error('Default white texture not found');
        return null;
      }
    }

    // Get sampler and bind group layout
    const sampler = this.textureManager.getSampler('linear');
    const textureBindGroupLayout =
      this.bindGroupManager.getBindGroupLayout('textureBindGroupLayout');
    if (!textureBindGroupLayout) {
      throw new Error('Texture bind group layout not found');
    }

    // Create texture bind group
    return this.bindGroupManager.createBindGroup(`${textureId}_textureBindGroup`, {
      layout: textureBindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
      label: `${textureId}_textureBindGroup`,
    });
  }

  /**
   * Get or create the material bind group (group 3) for a regular material
   */
  private ensureRegularMaterialBindGroup(renderable: RenderData): GPUBindGroup | null {
    const regularMaterial = renderable.material as WebGPUMaterialDescriptor;

    // Regular material handling - always provide a material bind group
    if (!regularMaterial.albedo) {
      // Use default material bind group
      const materialBindGroup = this.resourceManager.getBindGroupResource('materialBindGroup');
      return materialBindGroup ? materialBindGroup.bindGroup : null;
    }

    const materialBindGroupLayout =
      this.bindGroupManager.getBindGroupLayout('materialBindGroupLayout');
    if (!materialBindGroupLayout) {
      throw new Error('Material bind group layout not found');
    }

    // Create or get material bind group using the material identity computed at extract time
    return (
      this.materialManager.createMaterialBindGroup(
        renderable.materialKey,
        regularMaterial,
        materialBindGroupLayout,
      ) ?? null
    );
  }
}
