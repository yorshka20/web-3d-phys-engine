import { Component } from '@ecs/core/ecs/Component';
import { Vec3, Vec2 } from '@ecs/types/types';

// 3D顶点数据结构
export interface Vertex3D {
  position: Vec3; // 位置 [x, y, z]
  normal?: Vec3; // 法向量 [nx, ny, nz]
  uv?: Vec2; // UV坐标 [u, v]
  color?: Vec3; // 顶点颜色 [r, g, b]
}

// 3D网格描述符
export interface Mesh3DDescriptor {
  type: 'mesh';
  vertices: Vertex3D[];
  indices?: number[]; // 索引数组，用于三角形绘制
  primitiveType?: GPUPrimitiveTopology; // 图元类型
  bounds?: {
    min: Vec3;
    max: Vec3;
  };
}

// 基础几何体描述符
export interface BoxDescriptor {
  type: 'box';
  width: number;
  height: number;
  depth: number;
}

export interface SphereDescriptor {
  type: 'sphere';
  radius: number;
  segments?: number; // 球体细分段数
}

export interface CylinderDescriptor {
  type: 'cylinder';
  radius: number;
  height: number;
  segments?: number;
}

export interface PlaneDescriptor {
  type: 'plane';
  width: number;
  height: number;
  segments?: number;
}

export interface ConeDescriptor {
  type: 'cone';
  radius: number;
  height: number;
  segments?: number;
}

// 组合类型
export type Mesh3DShapeDescriptor =
  | Mesh3DDescriptor
  | BoxDescriptor
  | SphereDescriptor
  | CylinderDescriptor
  | PlaneDescriptor
  | ConeDescriptor;

interface Mesh3DProps {
  descriptor: Mesh3DShapeDescriptor;
  tessellated?: Vertex3D[]; // 预计算的顶点缓存
  indices?: number[]; // 预计算的索引缓存
  bounds?: { min: Vec3; max: Vec3 }; // Bounding box cache
}

export class Mesh3DComponent extends Component {
  static componentName = 'Mesh3D';

  descriptor: Mesh3DShapeDescriptor;
  tessellated: Vertex3D[] = []; // 顶点缓存
  indices: number[] = []; // 索引缓存
  bounds: { min: Vec3; max: Vec3 } | null = null;
  primitiveType: GPUPrimitiveTopology = 'triangle-list';

  private dirty: boolean = true;

  constructor(props: Mesh3DProps) {
    super('Mesh3D');
    this.descriptor = props.descriptor;

    if (props.tessellated) {
      this.tessellated = [...props.tessellated];
    }
    if (props.indices) {
      this.indices = [...props.indices];
    }
    if (props.bounds) {
      this.bounds = {
        min: [...props.bounds.min] as Vec3,
        max: [...props.bounds.max] as Vec3,
      };
    }
  }

  /**
   * 更新网格描述符
   */
  updateDescriptor(descriptor: Mesh3DShapeDescriptor): void {
    this.descriptor = descriptor;
    this.dirty = true;
    this.tessellated = [];
    this.indices = [];
    this.bounds = null;
  }

  /**
   * 检查是否需要重新计算缓存
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * 标记缓存为最新
   */
  markClean(): void {
    this.dirty = false;
  }

  /**
   * 强制标记为需要更新
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * 设置顶点缓存
   */
  setTessellated(vertices: Vertex3D[]): void {
    this.tessellated = [...vertices];
    this.dirty = false;
  }

  /**
   * 设置索引缓存
   */
  setIndices(indices: number[]): void {
    this.indices = [...indices];
  }

  /**
   * 设置包围盒缓存
   */
  setBounds(min: Vec3, max: Vec3): void {
    this.bounds = {
      min: [...min] as Vec3,
      max: [...max] as Vec3,
    };
  }

  /**
   * 获取网格类型
   */
  getType(): string {
    return this.descriptor.type;
  }

  /**
   * 获取网格尺寸
   */
  getSize(): Vec3 {
    const desc = this.descriptor;
    switch (desc.type) {
      case 'box':
        return [desc.width, desc.height, desc.depth];
      case 'sphere':
        return [desc.radius * 2, desc.radius * 2, desc.radius * 2];
      case 'cylinder':
        return [desc.radius * 2, desc.height, desc.radius * 2];
      case 'plane':
        return [desc.width, 0, desc.height];
      case 'cone':
        return [desc.radius * 2, desc.height, desc.radius * 2];
      case 'mesh':
        if (this.bounds) {
          return [
            this.bounds.max[0] - this.bounds.min[0],
            this.bounds.max[1] - this.bounds.min[1],
            this.bounds.max[2] - this.bounds.min[2],
          ];
        }
        return [0, 0, 0];
      default:
        return [0, 0, 0];
    }
  }

  /**
   * 获取半尺寸（用于碰撞检测）
   */
  getHalfExtents(): Vec3 {
    const size = this.getSize();
    return [size[0] / 2, size[1] / 2, size[2] / 2];
  }

  /**
   * 获取顶点数量
   */
  getVertexCount(): number {
    return this.tessellated.length;
  }

  /**
   * 获取索引数量
   */
  getIndexCount(): number {
    return this.indices.length;
  }

  reset(): void {
    super.reset();
    this.tessellated = [];
    this.indices = [];
    this.bounds = null;
    this.dirty = true;
    this.primitiveType = 'triangle-list';
    this.descriptor = { type: 'box', width: 1, height: 1, depth: 1 } as BoxDescriptor;
  }

  // ===== 便捷创建方法 =====

  static createBox(width: number, height: number, depth: number): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'box', width, height, depth },
    });
  }

  static createSphere(radius: number, segments: number = 32): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'sphere', radius, segments },
    });
  }

  static createCylinder(radius: number, height: number, segments: number = 32): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'cylinder', radius, height, segments },
    });
  }

  static createPlane(width: number, height: number, segments: number = 1): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'plane', width, height, segments },
    });
  }

  static createCone(radius: number, height: number, segments: number = 32): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'cone', radius, height, segments },
    });
  }

  static createMesh(vertices: Vertex3D[], indices?: number[]): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'mesh', vertices: [...vertices] },
      indices,
    });
  }
}
