import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';

interface Transform3DProps {
  position: Vec3;
  rotation?: Vec3; // Euler angles in radians [x, y, z]
  scale?: Vec3;
  fixed?: boolean;
  /**
   * Whether this entity can be recycled (auto-removed by RecycleSystem)
   * Defaults to true. Obstacles and some static entities should set this to false.
   */
  recyclable?: boolean;
}

export class Transform3DComponent extends Component {
  static componentName = 'Transform3D';

  position: Vec3 = [0, 0, 0];
  rotation: Vec3 = [0, 0, 0]; // Euler angles in radians
  scale: Vec3 = [1, 1, 1];
  fixed: boolean;
  /**
   * Whether this entity can be recycled (auto-removed by RecycleSystem)
   * Defaults to true. Obstacles/static entities should set to false.
   */
  recyclable: boolean;

  constructor(props: Transform3DProps) {
    super('Transform3D');
    this.position[0] = props.position[0];
    this.position[1] = props.position[1];
    this.position[2] = props.position[2];

    if (props.rotation) {
      this.rotation[0] = props.rotation[0];
      this.rotation[1] = props.rotation[1];
      this.rotation[2] = props.rotation[2];
    }

    if (props.scale) {
      this.scale[0] = props.scale[0];
      this.scale[1] = props.scale[1];
      this.scale[2] = props.scale[2];
    }

    this.fixed = props.fixed ?? false;
    this.recyclable = props.recyclable ?? true; // default true
  }

  getPosition(): Vec3 {
    return this.position;
  }

  setPosition(position: Vec3): void {
    if (this.fixed) return;
    this.position[0] = position[0];
    this.position[1] = position[1];
    this.position[2] = position[2];
    console.log('Transform3DComponent setPosition', JSON.stringify(this.position, null, 2));
  }

  move(dx: number, dy: number, dz: number): void {
    if (this.fixed) return;
    this.position[0] += dx;
    this.position[1] += dy;
    this.position[2] += dz;
  }

  getRotation(): Vec3 {
    return this.rotation;
  }

  setRotation(rotation: Vec3): void {
    if (this.fixed) return;
    this.rotation[0] = rotation[0];
    this.rotation[1] = rotation[1];
    this.rotation[2] = rotation[2];
    console.log('Transform3DComponent setRotation', JSON.stringify(this.rotation, null, 2));
  }

  rotate(dx: number, dy: number, dz: number): void {
    if (this.fixed) return;
    this.rotation[0] += dx;
    this.rotation[1] += dy;
    this.rotation[2] += dz;
  }

  getScale(): Vec3 {
    return this.scale;
  }

  setScale(scale: Vec3): void {
    if (this.fixed) return;
    this.scale[0] = scale[0];
    this.scale[1] = scale[1];
    this.scale[2] = scale[2];
  }

  scaleBy(factor: Vec3): void {
    if (this.fixed) return;
    this.scale[0] *= factor[0];
    this.scale[1] *= factor[1];
    this.scale[2] *= factor[2];
    console.log('Transform3DComponent scaleBy', JSON.stringify(this.scale, null, 2));
  }

  reset(): void {
    super.reset();
    // use new array to avoid reference issues
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];
    this.scale = [1, 1, 1];
    this.fixed = false;
    this.recyclable = true;
  }
}
