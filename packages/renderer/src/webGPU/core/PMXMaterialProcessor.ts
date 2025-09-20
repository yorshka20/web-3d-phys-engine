import { PMXMaterial, PMXTexture } from '@ecs/components/physics/mesh/PMXModel';
import { AssetDescriptor, assetRegistry } from './AssetRegistry';
import { BindGroupManager } from './BindGroupManager';
import { BufferManager } from './BufferManager';
import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { GPUResourceCoordinator } from './GPUResourceCoordinator';
import { PMXAssetDescriptor } from './PMXAssetDescriptor';
import { TextureManager } from './TextureManager';
import { BufferType } from './types';

// PMX material texture slot definitions
export const MaterialTextureSlots = {
  DIFFUSE: 0, // Diffuse texture (base color)
  NORMAL: 1, // Normal map (surface details)
  SPECULAR: 2, // Specular map (reflection intensity)
  ROUGHNESS: 3, // Roughness map
  METALLIC: 4, // Metallic map
  EMISSION: 5, // Emission map
  TOON: 6, // Toon rendering texture
  SPHERE: 7, // Sphere environment mapping
} as const;

export interface PMXMaterialTextureResource {
  texture: GPUTexture;
  view: GPUTextureView;
  sampler: GPUSampler;
  isDefault: boolean;
  name?: string;
}

export interface PMXMaterialCacheData {
  material: PMXMaterial;
  textureSlots: Map<number, PMXMaterialTextureResource>;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  renderOrder: 'opaque' | 'transparent';
  blendMode: 'alpha' | 'add' | 'multiply';
  materialType: 'pmx';
}

export interface PMXMaterialDescriptor {
  materialIndex: number;
  assetDescriptor: AssetDescriptor<'pmx_material'>;
}

@Injectable(ServiceTokens.PMX_MATERIAL_PROCESSOR, {
  lifecycle: 'singleton',
})
export class PMXMaterialProcessor {
  @Inject(ServiceTokens.TEXTURE_MANAGER)
  private textureManager!: TextureManager;

  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  @Inject(ServiceTokens.BIND_GROUP_MANAGER)
  private bindGroupManager!: BindGroupManager;

  @Inject(ServiceTokens.GPU_RESOURCE_COORDINATOR)
  private gpuResourceCoordinator!: GPUResourceCoordinator;

  private defaultTextures: Map<number, PMXMaterialTextureResource> = new Map();
  private materialCache: Map<string, PMXMaterialCacheData> = new Map();

  private enableLogging: boolean = false;

  /**
   * Enable logging
   */
  showLogs(): void {
    this.enableLogging = true;
  }

  /**
   * Disable logging
   */
  hideLogs(): void {
    this.enableLogging = false;
  }

  /**
   * Internal logging method
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.enableLogging) {
      console.log(message, ...args);
    }
  }

  initialize(): void {
    this.createMaterialBindGroupLayout();
  }

  /**
   * Process all materials for a PMX model using explicit asset descriptor
   */
  async processPMXMaterials(
    pmxMaterials: PMXMaterial[],
    pmxTextures: PMXTexture[],
    assetId: string,
    assetDescriptor: PMXAssetDescriptor,
  ): Promise<PMXMaterialCacheData[]> {
    const processedMaterials: PMXMaterialCacheData[] = [];

    for (let i = 0; i < pmxMaterials.length; i++) {
      const material = pmxMaterials[i];
      const materialId = `${assetId}_material_${i}`;

      // Check cache
      if (this.materialCache.has(materialId)) {
        processedMaterials.push(this.materialCache.get(materialId)!);
        continue;
      }

      // Process single material with explicit mapping
      const processedMaterial = await this.processSingleMaterialWithDescriptor(
        material,
        pmxTextures,
        materialId,
        assetDescriptor,
      );
      this.materialCache.set(materialId, processedMaterial);
      processedMaterials.push(processedMaterial);
    }

    return processedMaterials;
  }

  /**
   * Process single PMX material using explicit asset descriptor mapping
   */
  private async processSingleMaterialWithDescriptor(
    material: PMXMaterial,
    pmxTextures: PMXTexture[],
    materialId: string,
    assetDescriptor: PMXAssetDescriptor,
  ): Promise<PMXMaterialCacheData> {
    const textureSlots = new Map<number, PMXMaterialTextureResource>();

    // 1. high priority: use descriptor definition (based on material name)
    const materialDef = assetDescriptor.materialDefinitions[material.name];
    if (materialDef) {
      this.log(`[PMXMaterialProcessor] Using descriptor definition for: ${material.name}`);
      await this.loadMappedTextures(materialDef, textureSlots, assetDescriptor.modelId);
    } else {
      this.log(
        `[PMXMaterialProcessor] No descriptor found for material: ${material.name}, falling back to PMX textures`,
      );
      // 2. low priority: use PMX textures (maintain compatibility)
      await this.loadPMXSpecifiedTextures(
        material,
        pmxTextures,
        textureSlots,
        assetDescriptor.modelId,
      );
    }

    // 3. load shared textures
    await this.loadSharedTextures(assetDescriptor, material, textureSlots, assetDescriptor.modelId);

    // 4. Fill missing texture slots with defaults
    await this.fillMissingTextureSlots(textureSlots);

    // Create material uniform buffer
    const uniformBuffer = this.createMaterialUniformBuffer(material);

    // Ensure PMX material layout is created
    this.createMaterialBindGroupLayout();

    // Create bind group
    const bindGroup = this.createMaterialBindGroup(textureSlots, uniformBuffer, materialId);

    // Determine render order and blend mode
    const renderOrder = this.determineRenderOrder(material);
    const blendMode = this.determineBlendMode(material);

    return {
      material,
      textureSlots,
      uniformBuffer,
      bindGroup,
      renderOrder,
      blendMode,
      materialType: 'pmx',
    };
  }

  /**
   * Load PMX-specified textures with namespace isolation (maintain compatibility with existing PMX files)
   */
  private async loadPMXSpecifiedTextures(
    material: PMXMaterial,
    pmxTextures: PMXTexture[],
    textureSlots: Map<number, PMXMaterialTextureResource>,
    modelId: string,
  ): Promise<void> {
    // Process main texture (diffuse)
    if (material.textureIndex >= 0 && material.textureIndex < pmxTextures.length) {
      const textureInfo = pmxTextures[material.textureIndex];
      const texturePath = typeof textureInfo === 'string' ? textureInfo : textureInfo.path;
      // Normalize path separators to forward slashes
      const normalizedPath = texturePath.replace(/\\/g, '/');
      // Add textures/ prefix to match descriptor format
      const namespacedPath = `${modelId}/${normalizedPath}`;

      const textureResource = await this.getTextureForSlot(
        namespacedPath,
        MaterialTextureSlots.DIFFUSE,
      );
      if (textureResource) {
        textureSlots.set(MaterialTextureSlots.DIFFUSE, textureResource);
      }
    }

    // Process environment texture - determine usage based on filename and envFlag
    if (material.envTextureIndex >= 0 && material.envTextureIndex < pmxTextures.length) {
      const textureInfo = pmxTextures[material.envTextureIndex];
      const envTexturePath = typeof textureInfo === 'string' ? textureInfo : textureInfo.path;
      // Normalize path separators to forward slashes
      const normalizedPath = envTexturePath.replace(/\\/g, '/');
      const namespacedPath = `${modelId}/${normalizedPath}`;

      // Determine environment texture type
      let targetSlot: number;
      if (normalizedPath.includes('_S') || normalizedPath.includes('hair_s')) {
        targetSlot = MaterialTextureSlots.SPECULAR; // Specular map
      } else {
        targetSlot = MaterialTextureSlots.SPHERE; // Sphere environment map
      }

      const textureResource = await this.getTextureForSlot(namespacedPath, targetSlot);
      if (textureResource) {
        textureSlots.set(targetSlot, textureResource);
      }
    }

    // Process Toon texture
    if (material.toonFlag === 1) {
      if (material.toonIndex >= 0 && material.toonIndex < pmxTextures.length) {
        // Use external toon texture
        const textureInfo = pmxTextures[material.toonIndex];
        const toonTexturePath = typeof textureInfo === 'string' ? textureInfo : textureInfo.path;
        // Normalize path separators to forward slashes
        const normalizedPath = toonTexturePath.replace(/\\/g, '/');
        const namespacedPath = `${modelId}/${normalizedPath}`;

        const textureResource = await this.getTextureForSlot(
          namespacedPath,
          MaterialTextureSlots.TOON,
        );
        if (textureResource) {
          textureSlots.set(MaterialTextureSlots.TOON, textureResource);
        }
      } else {
        // Use built-in toon texture
        const builtinToonTexture = this.createBuiltinToonTexture(material.toonIndex);
        textureSlots.set(MaterialTextureSlots.TOON, builtinToonTexture);
      }
    }
  }

  /**
   * Load textures using explicit mapping from asset descriptor with namespace isolation
   */
  private async loadMappedTextures(
    materialDef: { textures: Record<string, string | undefined> },
    textureSlots: Map<number, PMXMaterialTextureResource>,
    modelId: string,
  ): Promise<void> {
    const mappings = [
      { src: materialDef.textures.diffuse, slot: MaterialTextureSlots.DIFFUSE },
      { src: materialDef.textures.normal, slot: MaterialTextureSlots.NORMAL },
      { src: materialDef.textures.specular, slot: MaterialTextureSlots.SPECULAR },
      { src: materialDef.textures.roughness, slot: MaterialTextureSlots.ROUGHNESS },
      { src: materialDef.textures.metallic, slot: MaterialTextureSlots.METALLIC },
      { src: materialDef.textures.emission, slot: MaterialTextureSlots.EMISSION },
      { src: materialDef.textures.toon, slot: MaterialTextureSlots.TOON },
      { src: materialDef.textures.sphere, slot: MaterialTextureSlots.SPHERE },
    ];

    for (const { src, slot } of mappings) {
      if (src) {
        const resource = await this.getTextureForSlot(`${modelId}/${src}`, slot);
        if (resource) {
          textureSlots.set(slot, resource);
          this.log(`[PMXMaterialProcessor] Loaded descriptor texture: ${src} for slot ${slot}`);
        }
      }
    }
  }

  /**
   * Load shared textures from asset descriptor with namespace isolation
   */
  private async loadSharedTextures(
    assetDescriptor: PMXAssetDescriptor,
    material: PMXMaterial,
    textureSlots: Map<number, PMXMaterialTextureResource>,
    modelId: string,
  ): Promise<void> {
    if (!assetDescriptor.sharedTextures) return;

    // Load toon textures
    if (assetDescriptor.sharedTextures.toon && assetDescriptor.sharedTextures.toon.length > 0) {
      const toonTexture = assetDescriptor.sharedTextures.toon[0]; // Use first toon texture
      const namespacedPath = `${modelId}/${toonTexture}`;
      const resource = await this.getTextureForSlot(namespacedPath, MaterialTextureSlots.TOON);
      if (resource) {
        textureSlots.set(MaterialTextureSlots.TOON, resource);
      }
    }

    // Load sphere textures
    if (assetDescriptor.sharedTextures.sphere && assetDescriptor.sharedTextures.sphere.length > 0) {
      const sphereTexture = assetDescriptor.sharedTextures.sphere[0]; // Use first sphere texture
      const namespacedPath = `${modelId}/${sphereTexture}`;
      const resource = await this.getTextureForSlot(namespacedPath, MaterialTextureSlots.SPHERE);
      if (resource) {
        textureSlots.set(MaterialTextureSlots.SPHERE, resource);
      }
    }
  }

  // create builtin toon texture
  private createBuiltinToonTexture(toonIndex: number): PMXMaterialTextureResource {
    const width = 256;
    const height = 1;
    const data = new Uint8Array(width * height * 4);

    for (let i = 0; i < width; i++) {
      const intensity = i / (width - 1);
      // create cartoon style step gradient
      let toonValue: number;
      if (intensity > 0.95) {
        toonValue = 255;
      } else if (intensity > 0.5) {
        toonValue = 128;
      } else if (intensity > 0.2) {
        toonValue = 64;
      } else {
        toonValue = 32;
      }

      const pixelIndex = i * 4;
      data[pixelIndex] = toonValue; // R
      data[pixelIndex + 1] = toonValue; // G
      data[pixelIndex + 2] = toonValue; // B
      data[pixelIndex + 3] = 255; // A
    }

    // create 1D toon lookup texture
    const texture = this.textureManager.createTexture(`builtin_toon_${toonIndex}`, {
      id: `builtin_toon_${toonIndex}`,
      width,
      height,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // upload data to GPU
    this.textureManager.updateTexture(`builtin_toon_${toonIndex}`, data, width, height);

    const sampler = this.textureManager.getSampler('linear');

    return {
      texture,
      view: texture.createView(),
      sampler,
      isDefault: false,
      name: `builtin_toon_${toonIndex}`,
    };
  }

  /**
   * get texture for specified slot (already preloaded)
   */
  private async getTextureForSlot(
    texturePath: string,
    slot: number,
  ): Promise<PMXMaterialTextureResource | null> {
    try {
      // check if texture is already in AssetRegistry
      const textureAsset = assetRegistry.getAssetDescriptor(texturePath);

      if (!textureAsset) {
        console.warn(`[PMXMaterialProcessor] Texture not found in AssetRegistry: ${texturePath}`);
        return this.getDefaultTextureForSlot(slot);
      }

      // get existing GPU texture resource from TextureManager
      let gpuTexture = this.textureManager.getTexture(texturePath);

      // if texture does not exist, create GPU texture
      if (!gpuTexture) {
        this.log(`[PMXMaterialProcessor] Creating GPU texture: ${texturePath}`);

        // get texture data from AssetRegistry
        const textureData = textureAsset.rawData;
        if (textureData instanceof HTMLImageElement) {
          // if HTMLImageElement, convert to ImageBitmap and create texture
          const imageBitmap = await createImageBitmap(textureData);
          gpuTexture = this.textureManager.createTexture(texturePath, {
            id: texturePath,
            width: imageBitmap.width,
            height: imageBitmap.height,
            format: 'rgba8unorm',
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_DST |
              GPUTextureUsage.RENDER_ATTACHMENT,
            initialData: imageBitmap,
          });
        } else if (textureData instanceof ImageBitmap) {
          // if already ImageBitmap, create texture
          gpuTexture = this.textureManager.createTexture(texturePath, {
            id: texturePath,
            width: textureData.width,
            height: textureData.height,
            format: 'rgba8unorm',
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_DST |
              GPUTextureUsage.RENDER_ATTACHMENT,
            initialData: textureData,
          });
        } else {
          console.warn(`Unsupported texture data type for ${texturePath}:`, typeof textureData);
          return this.getDefaultTextureForSlot(slot);
        }
      }

      if (!gpuTexture) {
        console.warn(`Failed to create GPU texture: ${texturePath}`);
        return this.getDefaultTextureForSlot(slot);
      }

      // get or create sampler
      const sampler =
        this.textureManager.getSampler('linear') ||
        this.textureManager.createSampler('linear', {
          id: 'linear',
          addressMode: 'clamp-to-edge',
          magFilter: 'linear',
          minFilter: 'linear',
        });

      return {
        texture: gpuTexture,
        view: gpuTexture.createView(),
        sampler,
        isDefault: false,
        name: texturePath,
      };
    } catch (error) {
      console.error(`Failed to get texture for slot ${slot}:`, error);
      return this.getDefaultTextureForSlot(slot);
    }
  }

  /**
   * fill missing texture slots
   */
  private fillMissingTextureSlots(textureSlots: Map<number, PMXMaterialTextureResource>): void {
    const requiredSlots = [
      MaterialTextureSlots.DIFFUSE,
      MaterialTextureSlots.NORMAL,
      MaterialTextureSlots.SPECULAR,
      MaterialTextureSlots.ROUGHNESS,
      MaterialTextureSlots.METALLIC,
      MaterialTextureSlots.EMISSION,
      MaterialTextureSlots.TOON,
      MaterialTextureSlots.SPHERE,
    ];

    for (const slot of requiredSlots) {
      if (!textureSlots.has(slot)) {
        textureSlots.set(slot, this.getDefaultTextureForSlot(slot));
      }
    }
  }

  /**
   * get default texture for specified slot
   */
  private getDefaultTextureForSlot(slot: number): PMXMaterialTextureResource {
    if (this.defaultTextures.has(slot)) {
      return this.defaultTextures.get(slot)!;
    }

    // create default texture
    const defaultTexture = this.createDefaultTextureForSlot(slot);
    this.defaultTextures.set(slot, defaultTexture);
    return defaultTexture;
  }

  /**
   * create default texture for specified slot
   */
  private createDefaultTextureForSlot(slot: number): PMXMaterialTextureResource {
    let textureData: Uint8Array;
    let format: GPUTextureFormat;

    switch (slot) {
      case MaterialTextureSlots.DIFFUSE:
        // white texture
        textureData = new Uint8Array([255, 255, 255, 255]);
        format = 'rgba8unorm';
        break;
      case MaterialTextureSlots.NORMAL:
        // normal default value (0.5, 0.5, 1.0) -> (128, 128, 255, 255)
        textureData = new Uint8Array([128, 128, 255, 255]);
        format = 'rgba8unorm';
        break;
      case MaterialTextureSlots.SPECULAR:
        // black texture
        textureData = new Uint8Array([0, 0, 0, 255]);
        format = 'rgba8unorm';
        break;
      case MaterialTextureSlots.ROUGHNESS:
        // roughness default value (medium roughness)
        textureData = new Uint8Array([128, 128, 128, 255]);
        format = 'rgba8unorm';
        break;
      case MaterialTextureSlots.METALLIC:
        // metallic default value (non-metallic)
        textureData = new Uint8Array([0, 0, 0, 255]);
        format = 'rgba8unorm';
        break;
      case MaterialTextureSlots.EMISSION:
        // emission default value (no emission)
        textureData = new Uint8Array([0, 0, 0, 255]);
        format = 'rgba8unorm';
        break;
      case MaterialTextureSlots.SPHERE:
        // sphere environment mapping default texture (white)
        textureData = new Uint8Array([255, 255, 255, 255]);
        format = 'rgba8unorm';
        break;
      case MaterialTextureSlots.TOON:
        // Toon texture default value (gradient texture)
        textureData = new Uint8Array([255, 255, 255, 255]);
        format = 'rgba8unorm';
        break;
      default:
        // default white texture
        textureData = new Uint8Array([255, 255, 255, 255]);
        format = 'rgba8unorm';
        break;
    }

    // create 1x1 texture
    const texture = this.textureManager.createTexture(`default_texture_slot_${slot}`, {
      id: `default_texture_slot_${slot}`,
      width: 1,
      height: 1,
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // create sampler
    const sampler = this.textureManager.getSampler('linear');

    return {
      texture,
      view: texture.createView(),
      sampler,
      isDefault: true,
    };
  }

  /**
   * create material uniform buffer
   */
  private createMaterialUniformBuffer(material: PMXMaterial): GPUBuffer {
    // calculate actual buffer size
    // diffuse(16) + specular(12) + shininess(4) + ambient(12) + edgeColor(16) +
    // edgeSize(4) + alpha(4) + toonFlag(4) + envFlag(4) + sphereMode(4) + padding(4) = 84 bytes
    // but GPU requires 16 bytes alignment, so use 96 bytes
    const bufferSize = 96;

    const buffer = this.bufferManager.createCustomBuffer(`pmx_material_uniform_${material.name}`, {
      type: BufferType.UNIFORM,
      size: bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformData = new Float32Array(24); // 96 bytes / 4 = 24 floats
    let offset = 0;

    // 1. diffuse: vec4<f32> - 16 bytes
    uniformData[offset++] = material.diffuse[0];
    uniformData[offset++] = material.diffuse[1];
    uniformData[offset++] = material.diffuse[2];
    uniformData[offset++] = material.diffuse[3];

    // 2. specular: vec3<f32> - 12 bytes
    uniformData[offset++] = material.specular[0];
    uniformData[offset++] = material.specular[1];
    uniformData[offset++] = material.specular[2];

    // 3. shininess: f32 - 4 bytes
    uniformData[offset++] = material.shininess;

    // 4. ambient: vec3<f32> - 12 bytes
    uniformData[offset++] = material.ambient[0];
    uniformData[offset++] = material.ambient[1];
    uniformData[offset++] = material.ambient[2];

    // 5. GPU alignment padding - 4 bytes (because next is vec4, need 16 bytes alignment)
    uniformData[offset++] = 0.0;

    // 6. edgeColor: vec4<f32> - 16 bytes
    uniformData[offset++] = material.edgeColor[0];
    uniformData[offset++] = material.edgeColor[1];
    uniformData[offset++] = material.edgeColor[2];
    uniformData[offset++] = material.edgeColor[3];

    // 7. edgeSize: f32 - 4 bytes
    uniformData[offset++] = material.edgeSize;

    // 8. alpha: f32 - 4 bytes
    uniformData[offset++] = material.diffuse[3]; // use diffuse alpha

    // 9. toonFlag: f32 - 4 bytes
    uniformData[offset++] = material.toonFlag;

    // 10. envFlag: f32 - 4 bytes
    uniformData[offset++] = material.envFlag;

    // 11. sphereMode: f32 - 4 bytes (based on envFlag setting)
    let sphereMode = 0.0;
    if (material.envFlag === 1)
      sphereMode = 1.0; // multiply blending
    else if (material.envFlag === 2)
      sphereMode = 2.0; // add blending
    else if (material.envFlag === 3) sphereMode = 3.0; // subtract blending
    uniformData[offset++] = sphereMode;

    // 12. padding: f32 - 4 bytes
    uniformData[offset++] = 0.0;

    this.bufferManager.updateBuffer(buffer, uniformData.buffer);
    return buffer;
  }

  async createPMXMaterial(label: string, descriptor: PMXMaterialDescriptor) {
    const { assetDescriptor, materialIndex } = descriptor;

    // Use GPUResourceCoordinator to create materials
    const materials = await this.gpuResourceCoordinator.createGPUResource<'pmx_material'>(label, {
      assetDescriptor: {
        ...assetDescriptor,
        type: 'pmx_material',
      },
    });

    if (!materials || materials.length === 0) {
      throw new Error('Failed to create PMX materials');
    }

    let index = materialIndex;
    // Validate material index
    if (materialIndex >= materials.length) {
      console.warn(
        `Material index ${materialIndex} out of range, using material 0. Available materials: ${materials.length}`,
      );
      index = 0;
    }

    // Cache and return the specific material
    const material = materials[index];
    return material;
  }

  /**
   * create PMX material bind group layout - use unique PMX layout ID
   */
  createMaterialBindGroupLayout(): GPUBindGroupLayout {
    return this.bindGroupManager.createBindGroupLayout('pmxMaterialBindGroupLayout', {
      entries: [
        // binding: 0 - Material Uniform Buffer
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        // binding: 1-2 - Diffuse Texture + Sampler
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // binding: 3-4 - Normal Texture + Sampler
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // binding: 5-6 - Specular Texture + Sampler
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // binding: 7-8 - Sphere/Environment Texture + Sampler
        {
          binding: 7,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 8,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // binding: 9-10 - Toon Texture + Sampler
        {
          binding: 9,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 10,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // binding: 11-12 - Roughness Texture + Sampler
        {
          binding: 11,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 12,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // binding: 13-14 - Metallic Texture + Sampler
        {
          binding: 13,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 14,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // binding: 15-16 - Emission Texture + Sampler
        {
          binding: 15,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 16,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
      label: 'PMXMaterialBindGroupLayout',
    });
  }

  /**
   * create material bind group
   */
  private createMaterialBindGroup(
    textureSlots: Map<number, PMXMaterialTextureResource>,
    uniformBuffer: GPUBuffer,
    materialId: string,
  ): GPUBindGroup {
    const entries: GPUBindGroupEntry[] = [];

    // Material properties uniform buffer
    entries.push({
      binding: 0,
      resource: { buffer: uniformBuffer },
    });

    // bind all texture slots - match new shader layout
    const slotBindings = [
      { slot: MaterialTextureSlots.DIFFUSE, textureBinding: 1, samplerBinding: 2 },
      { slot: MaterialTextureSlots.NORMAL, textureBinding: 3, samplerBinding: 4 },
      { slot: MaterialTextureSlots.SPECULAR, textureBinding: 5, samplerBinding: 6 },
      { slot: MaterialTextureSlots.SPHERE, textureBinding: 7, samplerBinding: 8 },
      { slot: MaterialTextureSlots.TOON, textureBinding: 9, samplerBinding: 10 },
      { slot: MaterialTextureSlots.ROUGHNESS, textureBinding: 11, samplerBinding: 12 },
      { slot: MaterialTextureSlots.METALLIC, textureBinding: 13, samplerBinding: 14 },
      { slot: MaterialTextureSlots.EMISSION, textureBinding: 15, samplerBinding: 16 },
    ];

    slotBindings.forEach(({ slot, textureBinding, samplerBinding }) => {
      const textureResource = textureSlots.get(slot);
      if (textureResource) {
        entries.push({
          binding: textureBinding,
          resource: textureResource.view,
        });
        entries.push({
          binding: samplerBinding,
          resource: textureResource.sampler,
        });
      }
    });

    // use PMX specific bind group layout
    const bindGroupLayout = this.bindGroupManager.getBindGroupLayout('pmxMaterialBindGroupLayout');
    if (!bindGroupLayout) {
      throw new Error('PMX Material bind group layout not found');
    }

    return this.bindGroupManager.createBindGroup(`pmx_material_bind_group_${materialId}`, {
      layout: bindGroupLayout,
      entries,
      label: `pmx_material_bind_group_${materialId}`,
    });
  }

  /**
   * determine render order
   */
  private determineRenderOrder(material: PMXMaterial): 'opaque' | 'transparent' {
    // check transparency
    if (material.diffuse[3] < 1.0) {
      return 'transparent';
    }

    // check material flags
    if (material.flag & 0x01) {
      // standard alpha blending
      return 'transparent';
    }

    return 'opaque';
  }

  /**
   * determine blend mode
   */
  private determineBlendMode(material: PMXMaterial): 'alpha' | 'add' | 'multiply' {
    const flag = material.flag;

    if (flag & 0x01) return 'alpha'; // standard alpha blending
    if (flag & 0x02) return 'add'; // add blending
    if (flag & 0x04) return 'multiply'; // multiply blending

    return 'alpha'; // default
  }

  /**
   * get processed material data
   */
  getMaterialData(materialId: string): PMXMaterialCacheData | undefined {
    return this.materialCache.get(materialId);
  }

  /**
   * clean up resources
   */
  onDestroy(): void {
    // clean up default textures
    for (const textureResource of this.defaultTextures.values()) {
      textureResource.texture.destroy();
    }
    this.defaultTextures.clear();

    // clean up material cache
    for (const materialData of this.materialCache.values()) {
      materialData.uniformBuffer.destroy();
    }
    this.materialCache.clear();
  }
}
