import { GLTFMaterial } from '@renderer/assets/GltfModel';
import { RenderData } from '@renderer/frame/types';
import { HGRPMaterialDescriptor } from '@renderer/material/hgrp';
import { WebGPUMaterialDescriptor } from '@renderer/material/types';
import { assetRegistry } from './AssetRegistry';
import { BindGroupManager } from './BindGroupManager';
import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable } from './decorators/ResourceDecorators';
import {
  getOrCreateHGRPMaterialBindGroupLayout,
  getOrCreateHGRPOutlineBindGroupLayout,
  HGRP_SAMPLER_BINDINGS,
  HGRP_SRGB_TEXTURE_SLOTS,
  hgrpTextureBindings,
} from './HGRPMaterialResources';
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
    if (renderable.material.materialType === 'hgrp') {
      return { group2: await this.ensureHGRPMaterialBindGroup(renderable) };
    }
    return {
      group2: this.ensureTextureBindGroup(renderable) ?? undefined,
      group3: this.ensureRegularMaterialBindGroup(renderable) ?? undefined,
    };
  }

  /**
   * Get or create the HGRP material bind group (group 2) and write its preset-driven params.
   * The entry list derives from the variant slot tables in HGRPMaterialResources (the same
   * source the layout is built from). Texture slots resolve through the same registry chain
   * as glTF textures; ramps/LUTs bind a clamp sampler because they are lookup strips, not
   * tiling images.
   */
  private async ensureHGRPMaterialBindGroup(renderable: RenderData): Promise<GPUBindGroup> {
    const material = renderable.material as HGRPMaterialDescriptor;
    const layout = getOrCreateHGRPMaterialBindGroupLayout(this.bindGroupManager, material.variant);
    const materialId = renderable.materialKey;

    const materialBuffer = this.bufferManager.createCustomBuffer(`${materialId}_material_buffer`, {
      type: BufferType.UNIFORM,
      size: 256, // HGRPMaterialParams: 7x vec4 + 36 f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const textureEntries: GPUBindGroupEntry[] = await Promise.all(
      hgrpTextureBindings(material.variant).map(async ({ binding, slot }) => {
        const texture = await this.getGLTFTexture(
          material.textures[slot],
          'gltf_default_white',
          HGRP_SRGB_TEXTURE_SLOTS.has(slot),
        );
        return { binding, resource: texture.createView() };
      }),
    );

    const bindGroup = this.bindGroupManager.createBindGroup(materialId, {
      layout,
      entries: [
        { binding: 0, resource: { buffer: materialBuffer } },
        ...textureEntries,
        {
          binding: HGRP_SAMPLER_BINDINGS.base,
          resource: this.textureManager.getSampler('linear'),
        },
        {
          binding: HGRP_SAMPLER_BINDINGS.ramp,
          resource: this.textureManager.getSampler('clamp'),
        },
      ],
      label: materialId,
    });

    const params = new Float32Array(64);
    const baseColor = material.colors._BaseColor ?? [1, 1, 1, 1];
    params.set(baseColor, 0);
    params.set(material.colors._ColorAdjustmentRimColor ?? [1, 1, 1, 1], 4);
    params[8] = material.floats._UseDiffRampMap ?? 0;
    // alpha_cutoff doubles as the clip switch: 0 disables the discard in the shader
    params[9] = material.alphaMode === 'mask' ? material.alphaCutoff : 0;
    params[10] = material.floats._ShadowColorBrightness ?? 1;
    params[11] = material.floats._ShadowColorSaturation ?? 1;
    params[12] = material.floats._UseShadowLutTex ?? 0;
    params[13] = material.floats._UseBumpMap ?? 0;
    params[14] = material.floats._BumpScale ?? 1;
    params[15] = material.floats._UseSDFLightmap ?? 0;
    // _SkinRimOff reduces the rim on skin by its scale factor; pre-composed here so the
    // shader sees one effective intensity
    const rimOffScale =
      (material.floats._SkinRimOff ?? 0) > 0 ? (material.floats._SkinRimOffScale ?? 1) : 1;
    params[16] = (material.floats._ColorAdjustmentRimIntensity ?? 0) * rimOffScale;
    params[17] = material.floats._ColorAdjustmentRimWidth ?? 0.35;
    params[18] = material.floats._UseSpecRampMap ?? 0;
    params[19] = material.floats._Smoothness ?? 0.5;
    params[20] = material.floats._Specular ?? 0.5;
    params[21] = material.floats._AnisotropyIntensity ?? 0;
    params[22] = material.floats._UseMatcap ?? 0;
    params[23] = material.floats._MatcapNormalScale ?? 1;
    params.set(material.colors._EmissionColor ?? [0, 0, 0, 1], 24);
    params[28] = material.floats._UseEmission ?? 0;
    params[29] = material.floats._EmissionBrightness ?? 1;
    params[30] = material.floats._OutlineWidth ?? 0;
    params[31] = material.floats._OutlineColorBrightness ?? 0.5;
    params[32] = material.floats._OutlineColorSaturation ?? 1;
    params[33] = material.floats._EyeHighLight ?? 0;
    params[34] = material.floats._OutlineOffsetZ ?? 0;
    params[35] = material.floats._UseLineMap ?? 0;
    params.set(material.colors._MatcapColor ?? [1, 1, 1, 1], 36);
    params.set(material.colors._EyeHighLightColor ?? [1, 1, 1, 1], 40);
    params.set(material.colors._EyeScatteringColor ?? [1, 1, 1, 1], 44);
    params[48] = material.floats._LineAmount ?? 300;
    params[49] = material.floats._LineIntensity ?? 0;
    params[50] = material.floats._LineRange ?? 1;
    params[51] = material.floats._LineSaturation ?? 1;
    params[52] = material.floats._LineValue ?? 1;
    params[53] = material.floats._Pantyhose ?? 0;
    params[54] = material.floats._PantyhoseSpecularInt ?? 0;
    params[55] = material.floats._PantyhoseSpecularValue ?? 0;
    params[56] = material.floats._PantyhoseAnisotropyDirection ?? 0;
    params[57] = material.floats._AnisotropyValue ?? 0.5;
    params.set(material.colors._PantyhoseColor ?? [0, 0, 0, 1], 60);
    this.device.queue.writeBuffer(materialBuffer, 0, params);

    return bindGroup;
  }

  /**
   * Get or create the outline bind group (group 2 of the outline pipeline) for an HGRP
   * material: the same uniform buffer as the variant bind group (created above, cached by
   * label) plus the base map that drives the outline color.
   */
  async ensureHGRPOutlineBindGroup(renderable: RenderData): Promise<GPUBindGroup> {
    const material = renderable.material as HGRPMaterialDescriptor;
    const layout = getOrCreateHGRPOutlineBindGroupLayout(this.bindGroupManager);
    const materialId = renderable.materialKey;

    const materialBuffer = this.bufferManager.createCustomBuffer(`${materialId}_material_buffer`, {
      type: BufferType.UNIFORM,
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const baseMap = await this.getGLTFTexture(
      material.textures._BaseMap,
      'gltf_default_white',
      true,
    );
    // Width mask (ST): white = full stroke, so the default-white fallback is a no-op
    const outlineMask = await this.getGLTFTexture(
      material.textures._OutlineMask,
      'gltf_default_white',
    );

    return this.bindGroupManager.createBindGroup(`${materialId}_outline`, {
      layout,
      entries: [
        { binding: 0, resource: { buffer: materialBuffer } },
        { binding: 1, resource: baseMap.createView() },
        { binding: 2, resource: this.textureManager.getSampler('linear') },
        { binding: 3, resource: outlineMask.createView() },
      ],
      label: `${materialId}_outline`,
    });
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
    // Color-space classification per glTF 2.0: baseColor/emissive are sRGB, the rest are data
    const baseColorTexture = await this.getGLTFTexture(
      gltfMaterial.baseColorTexture,
      'gltf_default_white',
      true,
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
      true,
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
   * Helper method to get GLTF texture with fallback to default. `srgb` marks COLOR content:
   * the texture is created as rgba8unorm-srgb so sampling decodes to linear light (alpha is
   * never decoded — density/mask alphas keep their raw values). Data textures (normals,
   * masks, ramps) stay raw. The GPU texture is cached by id and the first creation fixes the
   * format, so one image must not be used in both roles.
   */
  private async getGLTFTexture(
    textureId: string | undefined,
    defaultTextureId: string,
    srgb = false,
  ): Promise<GPUTexture> {
    const format: GPUTextureFormat = srgb ? 'rgba8unorm-srgb' : 'rgba8unorm';
    if (textureId) {
      // First check if GPU texture already exists in TextureManager
      let texture = this.textureManager.getTexture(textureId);
      if (texture) {
        if (texture.format !== format) {
          console.warn(
            `[MaterialBinder] Texture ${textureId} already created as ${texture.format}, requested ${format} — one image is used in both color and data roles`,
          );
        }
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
              format,
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
