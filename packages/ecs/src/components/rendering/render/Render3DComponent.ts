import { Component } from '@ecs/core/ecs/Component';
import { Color, Vec3 } from '@ecs/types/types';

export interface Material3D {
  // Basic material properties
  albedo: Color; // Base color
  metallic: number; // Metallic factor (0-1)
  roughness: number; // Roughness factor (0-1)
  emissive: Color; // Emissive color
  emissiveIntensity: number; // Emissive intensity

  // Textures
  albedoTexture?: string; // Texture path/ID
  normalTexture?: string; // Normal map
  metallicRoughnessTexture?: string; // Combined metallic/roughness map
  emissiveTexture?: string; // Emissive texture

  // UV transformations
  uvScale?: Vec3; // UV scale [u, v, w]
  uvOffset?: Vec3; // UV offset [u, v, w]

  // Alpha blending
  alphaMode?: 'opaque' | 'mask' | 'blend';
  alphaCutoff?: number; // Alpha cutoff for mask mode

  // Double sided rendering
  doubleSided?: boolean;
}

export interface Render3DProperties {
  material: Material3D;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  layer?: number; // Render layer for sorting
  customShader?: string; // Custom shader path/ID
  uniforms?: Record<string, any>; // Custom shader uniforms
}

/**
 * Render3DComponent is responsible for describing 3D rendering style (material, textures, shaders, etc.)
 * and does not contain any geometry information.
 * All geometry information should be provided by Mesh3DComponent.
 */
export class Render3DComponent extends Component {
  static componentName = 'Render3D';

  // Rendering style parameters (no geometry info)
  private visible: boolean;
  private castShadow: boolean;
  private receiveShadow: boolean;
  private layer: number;
  private customShader: string | undefined;
  private uniforms: Record<string, any>;
  private material: Material3D;

  /**
   * Render3DComponent is only responsible for rendering style (material, textures, shaders, etc.),
   * and does not contain any geometry information.
   * All geometry information should be provided by Mesh3DComponent.
   */
  constructor(properties: Render3DProperties) {
    super('Render3D');
    this.material = properties.material;
    this.visible = properties.visible ?? true;
    this.castShadow = properties.castShadow ?? true;
    this.receiveShadow = properties.receiveShadow ?? true;
    this.layer = properties.layer ?? 0;
    this.customShader = properties.customShader;
    this.uniforms = properties.uniforms ?? {};
  }

  recreate(properties: Render3DProperties): void {
    this.visible = properties.visible ?? true;
    this.castShadow = properties.castShadow ?? true;
    this.receiveShadow = properties.receiveShadow ?? true;
    this.layer = properties.layer ?? 0;
    this.customShader = properties.customShader;
    this.uniforms = properties.uniforms ?? {};
    this.material = properties.material;
  }

  getProperties(): Render3DProperties {
    return {
      material: this.material,
      visible: this.visible,
      castShadow: this.castShadow,
      receiveShadow: this.receiveShadow,
      layer: this.layer,
      customShader: this.customShader,
      uniforms: this.uniforms,
    };
  }

  // Getter methods for rendering style
  isVisible(): boolean {
    return this.visible;
  }

  getMaterial(): Material3D {
    return this.material;
  }

  getCastShadow(): boolean {
    return this.castShadow;
  }

  getReceiveShadow(): boolean {
    return this.receiveShadow;
  }

  getLayer(): number {
    return this.layer;
  }

  getCustomShader(): string | undefined {
    return this.customShader;
  }

  getUniforms(): Record<string, any> {
    return this.uniforms;
  }

  // Material property getters
  getAlbedo(): Color {
    return this.material.albedo;
  }

  getMetallic(): number {
    return this.material.metallic;
  }

  getRoughness(): number {
    return this.material.roughness;
  }

  getEmissive(): Color {
    return this.material.emissive;
  }

  getEmissiveIntensity(): number {
    return this.material.emissiveIntensity;
  }

  // Material update methods
  updateMaterial(material: Material3D): void {
    this.material = material;
  }

  updateAlbedo(albedo: Color): void {
    this.material.albedo = albedo;
  }

  updateMetallicRoughness(metallic: number, roughness: number): void {
    this.material.metallic = metallic;
    this.material.roughness = roughness;
  }

  updateEmissive(emissive: Color, intensity: number): void {
    this.material.emissive = emissive;
    this.material.emissiveIntensity = intensity;
  }

  reset(): void {
    super.reset();
    this.visible = true;
    this.castShadow = true;
    this.receiveShadow = true;
    this.layer = 0;
    this.customShader = undefined;
    this.uniforms = {};
    this.material = {
      albedo: { r: 1, g: 1, b: 1, a: 1 },
      metallic: 0,
      roughness: 0.5,
      emissive: { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: 0,
      doubleSided: false,
    };
  }

  // Convenient material creation methods
  static createBasicMaterial(albedo: Color): Material3D {
    return {
      albedo,
      metallic: 0,
      roughness: 0.5,
      emissive: { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: 0,
      doubleSided: false,
    };
  }

  static createMetallicMaterial(albedo: Color, metallic: number, roughness: number): Material3D {
    return {
      albedo,
      metallic,
      roughness,
      emissive: { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: 0,
      doubleSided: false,
    };
  }

  static createEmissiveMaterial(emissive: Color, intensity: number): Material3D {
    return {
      albedo: { r: 1, g: 1, b: 1, a: 1 },
      metallic: 0,
      roughness: 0.5,
      emissive,
      emissiveIntensity: intensity,
      doubleSided: false,
    };
  }
}
