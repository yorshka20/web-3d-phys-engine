import { GeometryData, GeometryPrimitiveOptions, GeometryType } from '@ecs/components/physics/mesh';

/**
 * Geometry cache item
 */
export interface GeometryCacheItem {
  geometry: GeometryData;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  vertexCount: number;
  indexCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/**
 * Geometry parameters
 */
export type GeometryParams<T extends GeometryType> = GeometryPrimitiveOptions[T];
