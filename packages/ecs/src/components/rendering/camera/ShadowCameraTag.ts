import { Component } from '@ecs/core/ecs/Component';

/**
 * Tag component to mark shadow camera entities
 * Used for shadow mapping and other shadow-related rendering
 */
export class ShadowCameraTag extends Component {
  static componentName = 'ShadowCameraTag';

  constructor() {
    super('ShadowCameraTag');
  }
}
