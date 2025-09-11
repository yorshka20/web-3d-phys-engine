import { Transform3DComponent } from '@ecs/components';
import { Mesh3DComponent } from '@ecs/components/physics/mesh/Mesh3DComponent';
import { CameraControlComponent } from '@ecs/components/rendering/camera/CameraControlComponent';
import { WebGPU3DRenderComponent } from '@ecs/components/rendering/render/WebGPU3DRenderComponent';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { OrbitCameraControlSystem } from '@ecs/systems/rendering/OrbitCameraControlSystem';
// import { Vec3 } from '@ecs/types/types';
import chroma from 'chroma-js';

/**
 * Camera Target Indicator Helper
 * Creates and manages a visual indicator for orbit camera target position
 */
export class CameraTargetIndicator {
  private world: World;
  private indicatorEntity: Entity | null = null;
  private orbitSystem: OrbitCameraControlSystem;
  private isVisible: boolean = true;

  constructor(world: World, orbitSystem: OrbitCameraControlSystem) {
    this.world = world;
    this.orbitSystem = orbitSystem;
  }

  /**
   * Create a target indicator entity
   */
  createIndicator(): Entity {
    if (this.indicatorEntity) {
      this.destroyIndicator();
    }

    // Create indicator entity
    this.indicatorEntity = this.world.createEntity('object');
    this.indicatorEntity.setLabel('camera-target-indicator');

    // Add sphere mesh (small sphere to indicate target position)
    this.indicatorEntity.addComponent(
      this.world.createComponent(Mesh3DComponent, {
        descriptor: {
          type: 'sphere',
          params: { radius: 0.1, segments: 16 }, // Small sphere
        },
      }),
    );

    // Add transform component
    this.indicatorEntity.addComponent(
      this.world.createComponent(Transform3DComponent, {
        position: [0, 0, 0], // Will be updated by updateIndicatorPosition
        scale: [1, 1, 1],
      }),
    );

    // Add render component with bright color
    this.indicatorEntity.addComponent(
      this.world.createComponent(WebGPU3DRenderComponent, {
        material: {
          albedo: chroma('#ff0000'), // Bright red
          metallic: 0,
          roughness: 0.2,
          emissive: chroma('#ff0000'), // Emissive for visibility
          emissiveIntensity: 0.5,
          customShaderId: 'emissive_shader',
        },
      }),
    );

    this.world.addEntity(this.indicatorEntity);
    return this.indicatorEntity;
  }

  /**
   * Update indicator position based on camera target
   */
  updateIndicatorPosition(cameraEntity: Entity): void {
    if (!this.indicatorEntity || !this.isVisible) return;

    const control = cameraEntity.getComponent<CameraControlComponent>(
      CameraControlComponent.componentName,
    );

    if (!control || !control.isOrbitMode()) return;

    const config = control.getOrbitConfig();
    if (!config) return;

    // Update indicator position to match camera target
    const transform = this.indicatorEntity.getComponent<Transform3DComponent>(
      Transform3DComponent.componentName,
    );

    if (transform) {
      transform.setPosition(config.target);
    }
  }

  /**
   * Show/hide the indicator
   */
  setVisible(visible: boolean): void {
    this.isVisible = visible;

    if (this.indicatorEntity) {
      const renderComponent = this.indicatorEntity.getComponent<WebGPU3DRenderComponent>(
        WebGPU3DRenderComponent.componentName,
      );

      if (renderComponent) {
        // You might need to add a visibility property to WebGPU3DRenderComponent
        // For now, we'll scale it to 0 to hide it
        const transform = this.indicatorEntity.getComponent<Transform3DComponent>(
          Transform3DComponent.componentName,
        );

        if (transform) {
          transform.setScale(visible ? [1, 1, 1] : [0, 0, 0]);
        }
      }
    }
  }

  /**
   * Toggle indicator visibility
   */
  toggleVisibility(): void {
    this.setVisible(!this.isVisible);
    console.log('[CameraTargetIndicator] toggleVisibility', this.isVisible);
  }

  /**
   * Destroy the indicator entity
   */
  destroyIndicator(): void {
    if (this.indicatorEntity) {
      this.world.removeEntity(this.indicatorEntity);
      this.indicatorEntity = null;
    }
  }

  /**
   * Get the indicator entity
   */
  getIndicatorEntity(): Entity | null {
    return this.indicatorEntity;
  }

  /**
   * Check if indicator is visible
   */
  isIndicatorVisible(): boolean {
    return this.isVisible;
  }
}
