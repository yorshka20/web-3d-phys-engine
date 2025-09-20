import { GeometryData, GeometryPrimitiveOptions, GeometryType } from '@ecs/components/physics/mesh';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';

/**
 * Geometry cache item
 */
export interface GeometryCacheItem {
  geometry: GeometryData;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  vertexCount: number;
  indexCount: number;
  primitiveType: GPUPrimitiveTopology;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/**
 * Geometry parameters
 */
export type GeometryParams<T extends GeometryType> = GeometryPrimitiveOptions[T];

/**
 * Geometry descriptor for creating geometry from type and params
 */
export interface GeometryDescriptor<T extends GeometryType = GeometryType> {
  type: T;
  params?: GeometryParams<T>;
}

/**
 * Geometry data descriptor for creating geometry from existing data
 */
export interface GeometryDataDescriptor {
  geometryData: GeometryData;
}

/**
 * PMX geometry descriptor for creating geometry from existing data
 */
export interface PMXGeometryDescriptor {
  pmxModel: PMXModel;
  materialIndex: number;
  geometryId: string;
}
