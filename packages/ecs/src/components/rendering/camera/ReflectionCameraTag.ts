import { Component } from '@ecs/core/ecs/Component';

/**
 * Tag component to mark reflection camera entities
 * Used for reflection mapping and other reflection-related rendering
 */
export class ReflectionCameraTag extends Component {
  static componentName = 'ReflectionCameraTag';

  constructor() {
    super('ReflectionCameraTag');
  }
}
