import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/types/types';
import {
  CircleShapeDescriptor,
  PatternDescriptor,
  RenderPatternType,
  ShapeDescriptor,
} from './types';

interface ShapeProps {
  descriptor: ShapeDescriptor;
  tessellated?: Point[]; // Precomputed vertex cache
  bounds?: { min: Point; max: Point }; // Bounding box cache
}

export class ShapeComponent extends Component {
  static componentName = 'Shape';

  descriptor: ShapeDescriptor;
  tessellated: Point[] = []; // Curve tessellation cache
  bounds: { min: Point; max: Point } | null = null;

  private dirty: boolean = true;

  constructor(props: ShapeProps) {
    super('Shape');
    this.descriptor = props.descriptor;
    if (props.tessellated) {
      this.tessellated = [...props.tessellated];
    }
    if (props.bounds) {
      this.bounds = {
        min: [...props.bounds.min] as Point,
        max: [...props.bounds.max] as Point,
      };
    }
  }

  /**
   * Type guard for PatternDescriptor
   */
  private isPatternDescriptor(desc: ShapeDescriptor): desc is PatternDescriptor {
    return desc.type === 'pattern';
  }

  /**
   * Update shape descriptor and pattern image if needed
   */
  updateDescriptor(descriptor: ShapeDescriptor): void {
    this.descriptor = descriptor;
    this.dirty = true;
    this.tessellated = [];
    this.bounds = null;
  }

  /**
   * Check if cache needs to be recalculated
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Mark cache as latest
   */
  markClean(): void {
    this.dirty = false;
  }

  /**
   * Force mark as needing update
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Set tessellated vertex cache
   */
  setTessellated(vertices: Point[]): void {
    this.tessellated = [...vertices];
    this.dirty = false;
  }

  /**
   * Set bounding box cache
   */
  setBounds(min: Point, max: Point): void {
    this.bounds = {
      min: [...min] as Point,
      max: [...max] as Point,
    };
  }

  /**
   * Get shape type
   */
  getType(): string {
    return this.descriptor.type;
  }

  /**
   * Get shape size
   * For circle: [diameter, diameter]
   * For rect: [width, height]
   * For polygon: bounding box size
   * For pattern: use descriptor.size or [0,0]
   * For bezier/composite: fallback to bounding box if available, else [0,0]
   */
  getSize(): [number, number] {
    const desc = this.descriptor;
    switch (desc.type) {
      case 'circle':
        // Circle: size is [diameter, diameter]
        return [desc.radius * 2, desc.radius * 2];
      case 'rect':
        // Rect: size is [width, height]
        return [desc.width, desc.height];
      case 'polygon':
        // Polygon: use bounding box if available, else [0,0]
        if (this.bounds) {
          return [this.bounds.max[0] - this.bounds.min[0], this.bounds.max[1] - this.bounds.min[1]];
        }
        return [0, 0];
      case 'pattern':
        // Pattern: use descriptor.size if present
        return desc.size ?? [0, 0];
      case 'bezier':
      case 'composite':
        // Bezier/composite: use bounding box if available
        if (this.bounds) {
          return [this.bounds.max[0] - this.bounds.min[0], this.bounds.max[1] - this.bounds.min[1]];
        }
        return [0, 0];
      default:
        return [0, 0];
    }
  }

  /**
   * Get half extents for border/collision checks.
   * For circle: [radius, radius]
   * For rect: [width/2, height/2]
   * For polygon: bounding box half extents
   * For pattern: half of descriptor.size or [0,0]
   * For bezier/composite: bounding box half extents if available
   * @returns [halfWidth, halfHeight]
   */
  getHalfExtents(): [number, number] {
    const size = this.getSize();
    return [size[0] / 2, size[1] / 2];
  }

  /**
   * Get pattern type if this is a pattern shape
   */
  getPatternType(): RenderPatternType | undefined {
    if (this.isPatternDescriptor(this.descriptor)) {
      return this.descriptor.patternType;
    }
    return undefined;
  }

  reset(): void {
    super.reset();
    this.tessellated = [];
    this.bounds = null;
    this.dirty = true;
    this.descriptor = { type: 'circle', radius: 1 } as CircleShapeDescriptor;
  }

  /**
   * Create a convenient method for creating basic geometric shapes
   */
  static createCircle(radius: number): ShapeComponent {
    return new ShapeComponent({
      descriptor: { type: 'circle', radius },
    });
  }

  static createRect(width: number, height: number): ShapeComponent {
    return new ShapeComponent({
      descriptor: { type: 'rect', width, height },
    });
  }

  static createPolygon(vertices: Point[]): ShapeComponent {
    return new ShapeComponent({
      descriptor: { type: 'polygon', vertices: [...vertices] },
    });
  }

  static createBezier(controlPoints: Point[], resolution: number = 50): ShapeComponent {
    return new ShapeComponent({
      descriptor: {
        type: 'bezier',
        controlPoints: [...controlPoints],
        resolution,
      },
    });
  }
}

// ===== Usage Examples =====

// // Example: Create a circular slime entity
// export function createSlimeEntity(): any {
//   const shapeComponent = new ShapeComponent({
//     descriptor: {
//       type: 'parametric',
//       equationName: 'wave',
//       parameters: {
//         baseRadius: 20,
//         frequency: 8,
//         amplitude: 3,
//       },
//       resolution: 64,
//     },
//   });

//   const rendererComponent = new ShapeRendererComponent({
//     fillColor: 'rgba(0, 255, 0, 0.8)',
//     strokeColor: 'rgba(0, 100, 0, 1)',
//     strokeWidth: 2,
//   });

//   return { shapeComponent, rendererComponent };
// }

// // Example: Create a composite shape
// export function createComplexShape(): ShapeComponent {
//   return new ShapeComponent({
//     descriptor: {
//       type: 'composite',
//       children: [
//         {
//           type: 'circle',
//           radius: 15,
//         },
//         {
//           type: 'rect',
//           width: 10,
//           height: 30,
//         },
//       ],
//       operations: ['union'],
//     },
//   });
// }
