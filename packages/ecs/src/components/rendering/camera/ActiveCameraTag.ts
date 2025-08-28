import { Component } from '@ecs/core/ecs/Component';

/**
 * Tag component to mark the active camera entity
 * Only one entity should have this component at a time
 */
export class ActiveCameraTag extends Component {
  static componentName = 'ActiveCameraTag';

  constructor() {
    super('ActiveCameraTag');
  }
}
