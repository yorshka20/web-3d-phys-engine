import type { Vec3 } from '@ecs';
import type { FolderApi, Pane } from 'tweakpane';

interface FieldBase {
  key: string;
  label?: string;
}

export interface Vec3Field<C> extends FieldBase {
  kind: 'vec3';
  get(component: C): Vec3;
  set(component: C, value: Vec3): void;
  step?: number;
  // Component stores radians, the widget edits degrees.
  degrees?: boolean;
}

export interface NumberField<C> extends FieldBase {
  kind: 'number';
  get(component: C): number;
  set(component: C, value: number): void;
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanField<C> extends FieldBase {
  kind: 'boolean';
  get(component: C): boolean;
  set(component: C, value: boolean): void;
}

// One editable value on a component, declared as a get/set pair so a widget never needs to
// know how the component stores it: Transform3D exposes a mutable Vec3 array, the render
// component only accepts whole-property updates, and both are described the same way here.
export type InspectorField<C> = Vec3Field<C> | NumberField<C> | BooleanField<C>;

const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * Build the widgets for one component's declared fields.
 *
 * This is the only place component editing talks to tweakpane. Every widget binds a private
 * view object and writes back through the field's `set` rather than binding the component
 * itself: tweakpane can only bind an object property, and reaching into `position[0]` would
 * bypass the guards the component applies (Transform3D drops writes while `fixed`, the render
 * component flags a resource rebuild).
 */
export function buildInspectorFields<C>(
  folder: FolderApi | Pane,
  component: C,
  fields: readonly InspectorField<C>[],
): void {
  for (const field of fields) {
    switch (field.kind) {
      case 'vec3':
        addVec3Field(folder, component, field);
        break;
      case 'number':
        addNumberField(folder, component, field);
        break;
      case 'boolean':
        addBooleanField(folder, component, field);
        break;
    }
  }
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

function addVec3Field<C>(folder: FolderApi | Pane, component: C, field: Vec3Field<C>): void {
  const scale = field.degrees ? DEGREES_PER_RADIAN : 1;
  const [x, y, z] = field.get(component);
  const view: Record<string, Point3> = {
    [field.key]: { x: x * scale, y: y * scale, z: z * scale },
  };
  const axis = { step: field.step ?? (field.degrees ? 1 : 0.05) };
  folder
    .addBinding(view, field.key, {
      label: field.label ?? field.key,
      x: axis,
      y: axis,
      z: axis,
    })
    .on('change', (ev) => {
      const value = ev.value as Point3;
      field.set(component, [value.x / scale, value.y / scale, value.z / scale]);
    });
}

function addNumberField<C>(folder: FolderApi | Pane, component: C, field: NumberField<C>): void {
  const view: Record<string, number> = { [field.key]: field.get(component) };
  folder
    .addBinding(view, field.key, {
      label: field.label ?? field.key,
      min: field.min,
      max: field.max,
      step: field.step,
    })
    .on('change', (ev) => field.set(component, ev.value as number));
}

function addBooleanField<C>(folder: FolderApi | Pane, component: C, field: BooleanField<C>): void {
  const view: Record<string, boolean> = { [field.key]: field.get(component) };
  folder
    .addBinding(view, field.key, { label: field.label ?? field.key })
    .on('change', (ev) => field.set(component, ev.value as boolean));
}
