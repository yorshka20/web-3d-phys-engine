import { Entity } from '../ecs/Entity';
import { ComponentConstructor, ComponentFactory, ComponentProps, IComponent } from '../ecs/types';
import { ObjectPool } from './ObjectPool';

export class PoolManager {
  private static instance: PoolManager;

  private entityPools: Map<string, ObjectPool<Entity>> = new Map();
  private componentPools: Map<ComponentConstructor<any>, ObjectPool<any>> = new Map();
  private componentFactories: Map<ComponentConstructor<any>, ComponentFactory<any>> = new Map();

  private constructor() {}

  static getInstance(): PoolManager {
    if (!PoolManager.instance) {
      PoolManager.instance = new PoolManager();
    }
    return PoolManager.instance;
  }

  createEntityPool(
    name: string,
    factory: () => Entity,
    initialSize: number = 0,
    maxSize: number = 1000,
  ): void {
    if (this.entityPools.has(name)) {
      console.warn(`Entity pool ${name} already exists`);
      return;
    }
    this.entityPools.set(name, new ObjectPool(factory, initialSize, maxSize));
  }

  createComponentPool<T extends IComponent>(
    ComponentClass: ComponentConstructor<T>,
    factory: ComponentFactory<T>,
    initialSize: number = 0,
    maxSize: number = 1000,
  ): void {
    if (this.componentPools.has(ComponentClass)) {
      console.warn(`Component pool ${ComponentClass.name} already exists`);
      return;
    }
    this.componentFactories.set(ComponentClass, factory);
    this.componentPools.set(ComponentClass, new ObjectPool<T>(factory, initialSize, maxSize));
  }

  /**
   * Get an entity from the pool
   * entity will not be recreated.
   * @param name - The name of the entity pool
   * @returns
   */
  getEntityFromPool(name: string): Entity | undefined {
    const pool = this.entityPools.get(name);
    if (!pool) {
      console.warn(`Entity pool ${name} does not exist`);
      return undefined;
    }
    return pool.get();
  }

  /**
   * Get a component from the pool
   * component will be recreated with the props
   * @param ComponentClass - The class of the component
   * @param props - The props to recreate the component with
   * @returns
   */
  getComponentFromPool<T extends IComponent, C extends ComponentConstructor<T>>(
    ComponentClass: C,
    props: ComponentProps<C>,
  ): T | undefined {
    const pool = this.componentPools.get(ComponentClass);
    if (!pool) {
      console.warn(`Component pool ${ComponentClass.name} does not exist`);
      return undefined;
    }
    const component = pool.get(props);
    return component as T;
  }

  returnEntityToPool(name: string, entity: Entity): void {
    const pool = this.entityPools.get(name);
    if (!pool) {
      console.warn(`Entity pool ${name} does not exist`);
      return;
    }
    pool.return(entity);
  }

  returnComponentToPool<T extends IComponent>(
    ComponentClass: ComponentConstructor<T>,
    component: T,
  ): void {
    const pool = this.componentPools.get(ComponentClass);
    if (!pool) {
      console.warn(`Component pool ${ComponentClass.name} does not exist`);
      return;
    }
    // Don't reset component immediately - let ObjectPool handle it when retrieved
    // component.reset();
    pool.return(component);
  }

  clearEntityPool(name: string): void {
    const pool = this.entityPools.get(name);
    pool?.clear();
  }

  clearComponentPool(ComponentClass: ComponentConstructor<any>): void {
    const pool = this.componentPools.get(ComponentClass);
    pool?.clear();
  }

  clearAllPools(): void {
    this.entityPools.forEach((pool) => pool.clear());
    this.componentPools.forEach((pool) => pool.clear());
  }

  getEntityPoolSize(name: string): number {
    const pool = this.entityPools.get(name);
    return pool ? pool.getSize() : 0;
  }

  getComponentPoolSize(ComponentClass: ComponentConstructor<any>): number {
    const pool = this.componentPools.get(ComponentClass);
    return pool ? pool.getSize() : 0;
  }

  /**
   * Get comprehensive statistics for all entity pools
   */
  getEntityPoolStatistics(): Map<string, number> {
    const statistics = new Map<string, number>();

    for (const [name, pool] of this.entityPools) {
      statistics.set(name, pool.getSize());
    }

    return statistics;
  }

  /**
   * Get comprehensive statistics for all component pools
   */
  getComponentPoolStatistics(): Map<string, number> {
    const statistics = new Map<string, number>();

    for (const [ComponentClass, pool] of this.componentPools) {
      statistics.set(ComponentClass.name, pool.getSize());
    }

    return statistics;
  }

  /**
   * Get total pool statistics including entity and component pools
   */
  getAllPoolStatistics(): {
    entityPools: Map<string, number>;
    componentPools: Map<string, number>;
    totalEntityPoolSize: number;
    totalComponentPoolSize: number;
  } {
    const entityPools = this.getEntityPoolStatistics();
    const componentPools = this.getComponentPoolStatistics();

    const totalEntityPoolSize = Array.from(entityPools.values()).reduce(
      (sum, size) => sum + size,
      0,
    );
    const totalComponentPoolSize = Array.from(componentPools.values()).reduce(
      (sum, size) => sum + size,
      0,
    );

    return {
      entityPools,
      componentPools,
      totalEntityPoolSize,
      totalComponentPoolSize,
    };
  }
}
