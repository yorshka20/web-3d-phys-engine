import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';
import { AssetDescriptor, assetRegistry, AssetType } from '@renderer';
import { GeometryData, GeometryFactory } from './GeometryFactory';
import { AnyMesh3DShapeDescriptor, GeometryPrimitiveOptions, Vertex3D } from './types';

interface Mesh3DProps {
  descriptor: AnyMesh3DShapeDescriptor;
  vertices?: Vertex3D[]; // pre-calculated vertex cache
  indices?: number[]; // pre-calculated indices cache
  bounds?: { min: Vec3; max: Vec3 }; // bounding box cache
  primitiveType?: GPUPrimitiveTopology; // primitive topology for rendering
}

export class Mesh3DComponent extends Component {
  static componentName = 'Mesh3D';

  descriptor: AnyMesh3DShapeDescriptor;
  geometryData?: GeometryData[];
  vertices: Vertex3D[] = []; // vertex cache
  indices: number[] = []; // indices cache
  bounds: { min: Vec3; max: Vec3 } | null = null;

  assetDescriptor: AssetDescriptor<AssetType> | undefined;
  assetId: string = '';

  private dirty: boolean = true;

  constructor(props: Mesh3DProps) {
    super('Mesh3D');
    this.descriptor = this.normalizeDescriptor(props.descriptor);

    if (props.vertices) {
      this.vertices = [...props.vertices];
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

    this.initializeData();
  }

  private initializeData(): void {
    if (this.descriptor.type === 'gltf') {
      this.assetId = this.descriptor.assetId;
      this.resolveAsset<'gltf'>();
    }
  }

  /**
   * Resolve asset reference from registry
   */
  resolveAsset<T extends AssetType>(): AssetDescriptor<T> | undefined {
    if (!this.assetDescriptor) {
      this.assetDescriptor = assetRegistry.getAssetDescriptor<T>(this.assetId);
      if (this.assetDescriptor) {
        assetRegistry.addRef(this.assetId);
      }
    }
    return this.assetDescriptor as AssetDescriptor<T> | undefined;
  }

  /**
   * check if need to recalculate cache
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * mark cache as latest
   */
  markClean(): void {
    this.dirty = false;
  }

  /**
   * force mark as need to update
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * set vertex cache
   */
  setVertices(vertices: Vertex3D[]): void {
    this.vertices = [...vertices];
    this.dirty = false;
  }

  /**
   * set indices cache
   */
  setIndices(indices: number[]): void {
    this.indices = [...indices];
  }

  /**
   * set bounding box cache
   */
  setBounds(min: Vec3, max: Vec3): void {
    this.bounds = {
      min: [...min] as Vec3,
      max: [...max] as Vec3,
    };
  }

  /**
   * get mesh type
   */
  getType(): string {
    return this.descriptor.type;
  }

  /**
   * get primitive type
   */
  getPrimitiveType(): GPUPrimitiveTopology {
    return this.descriptor.primitiveType ?? 'triangle-list';
  }

  /**
   * get mesh size
   */
  getSize(): Vec3 {
    const desc = this.descriptor;
    switch (desc.type) {
      //
      default:
        return [0, 0, 0];
    }
  }

  /**
   * get half size (for collision detection)
   */
  getHalfExtents(): Vec3 {
    const size = this.getSize();
    return [size[0] / 2, size[1] / 2, size[2] / 2];
  }

  /**
   * get vertex count
   */
  getVertexCount(): number {
    return this.vertices.length;
  }

  /**
   * get index count
   */
  getIndexCount(): number {
    return this.indices.length;
  }

  reset(): void {
    super.reset();
    this.vertices = [];
    this.indices = [];
    this.bounds = null;
    this.dirty = true;
    this.descriptor = { type: 'unset', primitiveType: 'triangle-list' };
  }

  // ===== Convenient create methods =====

  static createBox(params: GeometryPrimitiveOptions['box']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'box', params },
    });
  }

  static createSphere(params: GeometryPrimitiveOptions['sphere']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'sphere', params },
    });
  }

  static createCylinder(params: GeometryPrimitiveOptions['cylinder']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'cylinder', params },
    });
  }

  static createPlane(params: GeometryPrimitiveOptions['plane']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'plane', params },
    });
  }

  static createCone(params: GeometryPrimitiveOptions['cone']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'cone', params },
    });
  }

  static createIcosphere(params: GeometryPrimitiveOptions['icosphere']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'icosphere', params },
    });
  }

  static createEllipsoid(params: GeometryPrimitiveOptions['ellipsoid']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'ellipsoid', params },
    });
  }

  static createCapsule(params: GeometryPrimitiveOptions['capsule']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'capsule', params },
    });
  }

  static createTorus(params: GeometryPrimitiveOptions['torus']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'torus', params },
    });
  }

  static createTetrahedron(params: GeometryPrimitiveOptions['tetrahedron']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'tetrahedron', params },
    });
  }

  static createIcosahedron(params: GeometryPrimitiveOptions['icosahedron']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'icosahedron', params },
    });
  }

  static createQuad(params: GeometryPrimitiveOptions['quad']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'quad', params },
    });
  }

  static createRoundedCube(params: GeometryPrimitiveOptions['roundedCube']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'roundedCube', params },
    });
  }

  static createEllipse(params: GeometryPrimitiveOptions['ellipse']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'ellipse', params },
    });
  }

  static createDisc(params: GeometryPrimitiveOptions['disc']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'disc', params },
    });
  }

  static createCircle(params: GeometryPrimitiveOptions['circle']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'circle', params },
    });
  }

  static createRoundedRectangle(
    params: GeometryPrimitiveOptions['roundedRectangle'],
  ): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'roundedRectangle', params },
    });
  }

  static createStadium(params: GeometryPrimitiveOptions['stadium']): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'stadium', params },
    });
  }

  static createMesh(vertices: Vertex3D[], indices?: number[]): Mesh3DComponent {
    return new Mesh3DComponent({
      descriptor: { type: 'mesh', vertices: [...vertices] },
      indices,
    });
  }

  /**
   * Normalize descriptor by ensuring params is defined with default values
   */
  private normalizeDescriptor(descriptor: AnyMesh3DShapeDescriptor): AnyMesh3DShapeDescriptor {
    // Handle unset or mesh descriptors
    if (descriptor.type === 'unset' || descriptor.type === 'mesh') {
      return descriptor;
    }

    // For primitive geometry types, ensure params is defined
    if (!descriptor.params) {
      // Create a new descriptor with default params based on geometry type
      const defaultParams = GeometryFactory.getDefaultParams(descriptor.type);
      return {
        ...descriptor,
        params: defaultParams,
      } as AnyMesh3DShapeDescriptor;
    }

    return descriptor;
  }
}
