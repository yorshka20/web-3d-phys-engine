/**
 * PMX Asset Descriptor System
 * Provides explicit model asset descriptors to eliminate texture inference logic
 */

/**
 * Material texture mapping configuration
 * Explicitly defines texture files for each material index
 */
export interface MaterialTextureMapping {
  textures: {
    diffuse?: string; // Diffuse texture
    normal?: string; // Normal map
    specular?: string; // Specular map
    roughness?: string; // Roughness map
    emission?: string; // Emission map
    metallic?: string; // Metallic map
  };
}

/**
 * Shared texture configuration
 * Defines model-level shared textures (such as toon, sphere, etc.)
 */
export interface SharedTextures {
  toon?: string[]; // Toon rendering texture list
  sphere?: string[]; // Sphere environment mapping texture list
  matcap?: string[]; // Material capture texture list
}

/**
 * PMX model asset descriptor
 * Complete description of all asset information for a PMX model
 */
export interface PMXAssetDescriptor {
  modelId: string; // Model unique identifier
  pmxPath: string; // PMX file path
  materialDefinitions: {
    [materialName: string]: MaterialTextureMapping; // Material string name to texture mapping
  };
  sharedTextures?: SharedTextures; // Shared texture configuration
  textureUrlMap: Record<string, string>; // Texture path to actual URL mapping
}

/**
 * Asset descriptor validation result
 */
export interface AssetDescriptorValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Asset descriptor validator
 */
export class AssetDescriptorValidator {
  /**
   * Validates the completeness and correctness of asset descriptors
   */
  static validate(descriptor: PMXAssetDescriptor): AssetDescriptorValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!descriptor.modelId) {
      errors.push('modelId is required');
    }

    if (!descriptor.pmxPath) {
      errors.push('pmxPath is required');
    }

    if (
      !descriptor.materialDefinitions ||
      Object.keys(descriptor.materialDefinitions).length === 0
    ) {
      warnings.push('No material definitions found');
    }

    // Validate material definitions
    for (const [materialName, materialDef] of Object.entries(descriptor.materialDefinitions)) {
      if (!materialName) {
        errors.push(`Material ${materialName} is missing name`);
      }

      if (!materialDef.textures || Object.keys(materialDef.textures).length === 0) {
        warnings.push(`Material ${materialName} has no texture definitions`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check texture path format
   */
  static validateTexturePath(path: string): boolean {
    // Basic path format validation
    return typeof path === 'string' && path.length > 0 && !path.includes('..');
  }
}
