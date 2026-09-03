import { Transform3DComponent, WebGPU3DRenderComponent } from '@ecs';
import type { ComponentInspector } from './registry';

// `fixed` is editable because it is what makes the position/rotation/scale widgets above it
// do nothing: Transform3D drops every write while it is set.
export const transform3DInspector: ComponentInspector<Transform3DComponent> = {
  componentName: Transform3DComponent.componentName,
  title: 'Transform',
  fields: [
    {
      kind: 'vec3',
      key: 'position',
      get: (component) => component.getPosition(),
      set: (component, value) => component.setPosition(value),
    },
    {
      kind: 'vec3',
      key: 'rotation',
      degrees: true,
      get: (component) => component.getRotation(),
      set: (component, value) => component.setRotation(value),
    },
    {
      kind: 'vec3',
      key: 'scale',
      step: 0.01,
      get: (component) => component.getScale(),
      set: (component, value) => component.setScale(value),
    },
    {
      kind: 'boolean',
      key: 'fixed',
      get: (component) => component.fixed,
      set: (component, value) => {
        component.fixed = value;
      },
    },
  ],
};

export const webGPU3DRenderInspector: ComponentInspector<WebGPU3DRenderComponent> = {
  componentName: WebGPU3DRenderComponent.componentName,
  title: 'Render',
  fields: [
    {
      kind: 'boolean',
      key: 'visible',
      get: (component) => component.isVisible(),
      set: (component, value) => component.setVisible(value),
    },
    {
      kind: 'boolean',
      key: 'castShadow',
      get: (component) => component.getCastShadow(),
      set: (component, value) => component.updateProperties({ castShadow: value }),
    },
    {
      kind: 'boolean',
      key: 'receiveShadow',
      get: (component) => component.getReceiveShadow(),
      set: (component, value) => component.updateProperties({ receiveShadow: value }),
    },
    {
      kind: 'number',
      key: 'layer',
      label: 'renderOrder',
      step: 1,
      get: (component) => component.getLayer(),
      set: (component, value) => component.updateProperties({ layer: value }),
    },
  ],
};
