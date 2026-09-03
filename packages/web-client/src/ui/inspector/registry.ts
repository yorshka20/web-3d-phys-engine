import type { Entity } from '@ecs';
import type { FolderApi, Pane } from 'tweakpane';
import { transform3DInspector, webGPU3DRenderInspector } from './builtins';
import { buildInspectorFields, type InspectorField } from './fields';

// What one component type exposes to the entity inspector. A component becomes editable by
// declaring this once; nothing else in the UI names the component or its accessors.
export interface ComponentInspector<C> {
  componentName: string;
  title: string;
  fields: readonly InspectorField<C>[];
}

interface RegisteredInspector {
  componentName: string;
  title: string;
  build(folder: FolderApi, component: unknown): void;
}

const inspectors = new Map<string, RegisteredInspector>();

/**
 * Make a component type editable in the entity tab. The component's type is erased here — the
 * single cast in this file — so that the registry can hold every component kind while each
 * declaration stays checked against its own component at the point it is written.
 */
export function registerComponentInspector<C>(inspector: ComponentInspector<C>): void {
  inspectors.set(inspector.componentName, {
    componentName: inspector.componentName,
    title: inspector.title,
    build: (folder, component) => buildInspectorFields(folder, component as C, inspector.fields),
  });
}

registerComponentInspector(transform3DInspector);
registerComponentInspector(webGPU3DRenderInspector);

export function hasInspectableComponent(entity: Entity): boolean {
  for (const componentName of inspectors.keys()) {
    if (entity.hasComponent(componentName)) {
      return true;
    }
  }
  return false;
}

/**
 * Build one folder per inspectable component the entity carries.
 */
export function buildEntityInspector(parent: FolderApi | Pane, entity: Entity): void {
  for (const inspector of inspectors.values()) {
    if (!entity.hasComponent(inspector.componentName)) {
      continue;
    }
    const folder = parent.addFolder({ title: inspector.title, expanded: true });
    inspector.build(folder, entity.getComponent(inspector.componentName));
  }
}
