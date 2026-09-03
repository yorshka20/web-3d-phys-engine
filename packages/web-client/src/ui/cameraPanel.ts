import { Camera3DComponent, CameraControlComponent, Entity, Transform3DComponent } from '@ecs';
import type { BindingApi } from '@tweakpane/core';
import { Pane } from 'tweakpane';
import { draggable } from './draggable';

/**
 * Camera parameters, editable.
 *
 * The orbit controller is the authority: it derives the transform from target/azimuth/
 * elevation/distance every frame, so the transform's own rotation is a by-product and
 * reading it back describes nothing the user can act on — which is why the previous
 * read-only panel showed values that did not match what the camera was doing. This binds
 * the controller's config and state instead, plus the projection scalars (rebuilt into a
 * matrix every frame by WebGPURenderSystem, so writing the field is enough). Position stays
 * read-only: it is what those inputs produce.
 *
 * Config edits go through updateConfig with the LIVE orbit config spread underneath: the
 * component replaces its nested config object on every update, so a copy taken at mount would
 * both go stale and, spread back, revert whatever another widget changed since.
 */
export function mountCameraPanel(camera: Entity): () => void {
  const control = camera.getComponent<CameraControlComponent>(CameraControlComponent.componentName);
  const cameraComp = camera.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
  const transform = camera.getComponent<Transform3DComponent>(Transform3DComponent.componentName);
  if (!control || !cameraComp || !transform) {
    console.warn('[cameraPanel] camera entity lacks control/camera/transform, panel not mounted');
    return () => {};
  }

  const host = document.createElement('div');
  host.id = 'camera-panel-host';
  host.style.cssText = 'position: fixed; top: 10px; left: 10px; z-index: 1000; width: 300px;';
  document.body.appendChild(host);

  const pane = new Pane({ container: host, title: 'Camera' });
  // Drag by tweakpane's own title bar rather than adding a header of our own. `.tp-rotv_b`
  // is that bar; if a tweakpane upgrade renames it, draggable falls back to the whole
  // container, which still moves — it just also starts a drag from a widget.
  const drag = draggable(host, { handle: '.tp-rotv_b' });

  const orbitConfig = control.getOrbitConfig();
  const target = {
    x: orbitConfig?.target[0] ?? 0,
    y: orbitConfig?.target[1] ?? 0,
    z: orbitConfig?.target[2] ?? 0,
  };
  const view = { distance: 0, azimuth: 0, elevation: 0 };
  const position = { value: '' };
  // The readouts the orbit controller writes behind the panel's back; everything else only
  // changes when the user moves the widget itself, so nothing else is worth repainting.
  const liveBindings: BindingApi[] = [];
  let distanceBinding: BindingApi | undefined;

  const readPosition = () => {
    const p = transform.getPosition();
    return `${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)}`;
  };

  if (orbitConfig) {
    type OrbitConfig = NonNullable<typeof orbitConfig>;
    const pushOrbit = (updates: Partial<OrbitConfig>) =>
      control.updateConfig({ orbit: { ...control.getOrbitConfig()!, ...updates } });

    const pushTarget = () => pushOrbit({ target: [target.x, target.y, target.z] });
    const folder = pane.addFolder({ title: 'Orbit target', expanded: true });
    for (const axis of ['x', 'y', 'z'] as const) {
      folder.addBinding(target, axis, { step: 0.05 }).on('change', pushTarget);
    }

    const live = control.getOrbitState();
    view.distance = live?.distance ?? 0;
    view.azimuth = ((live?.azimuth ?? 0) * 180) / Math.PI;
    view.elevation = ((live?.elevation ?? 0) * 180) / Math.PI;

    // The distance slider spans [minDistance, maxDistance]; those are editable below, and a
    // tweakpane binding takes its range at creation, so a limit change rebuilds the slider in
    // place.
    const addDistance = (index: number) => {
      const { minDistance, maxDistance } = control.getOrbitConfig()!;
      distanceBinding = pane
        .addBinding(view, 'distance', { min: minDistance, max: maxDistance, step: 0.05, index })
        .on('change', (ev) => ev.last && control.updateOrbitState({ distance: view.distance }));
    };
    addDistance(pane.children.length);
    liveBindings.push(
      pane
        .addBinding(view, 'azimuth', { min: -180, max: 180, step: 0.5 })
        .on(
          'change',
          (ev) => ev.last && control.updateOrbitState({ azimuth: (view.azimuth * Math.PI) / 180 }),
        ),
    );
    liveBindings.push(
      pane
        .addBinding(view, 'elevation', { min: -89, max: 89, step: 0.5 })
        .on(
          'change',
          (ev) =>
            ev.last && control.updateOrbitState({ elevation: (view.elevation * Math.PI) / 180 }),
        ),
    );

    // Control sensitivities and limits (main.ts create3DCamera seeds them; the orbit system
    // reads the live config on every input event, so a push is enough). Zoom is exponential
    // per wheel unit, rotation/pan are radians / units per pixel, moveSpeed is units per second
    // before the sprint multiplier.
    const controls = pane.addFolder({ title: 'Controls', expanded: false });
    const tuning = { ...orbitConfig };
    const bindControl = (
      key: 'zoomSensitivity' | 'rotationSensitivity' | 'panSensitivity' | 'moveSpeed',
      params: { min: number; max: number; step: number },
    ) =>
      controls
        .addBinding(tuning, key, params)
        .on('change', () => pushOrbit({ [key]: tuning[key] }));
    bindControl('zoomSensitivity', { min: 0.0005, max: 0.02, step: 0.0005 });
    bindControl('rotationSensitivity', { min: 0.001, max: 0.03, step: 0.001 });
    bindControl('panSensitivity', { min: 0.001, max: 0.05, step: 0.001 });
    bindControl('moveSpeed', { min: 0.5, max: 60, step: 0.5 });
    for (const key of ['enableZoom', 'enableRotation', 'enablePan'] as const) {
      controls.addBinding(tuning, key).on('change', () => pushOrbit({ [key]: tuning[key] }));
    }
    const rebuildDistance = () => {
      const index = distanceBinding ? pane.children.indexOf(distanceBinding) : pane.children.length;
      distanceBinding?.dispose();
      addDistance(index);
    };
    controls
      .addBinding(tuning, 'minDistance', { min: 0.05, max: 10, step: 0.05 })
      .on('change', (ev) => {
        pushOrbit({ minDistance: tuning.minDistance });
        if (ev.last) rebuildDistance();
      });
    controls.addBinding(tuning, 'maxDistance', { min: 5, max: 500, step: 5 }).on('change', (ev) => {
      pushOrbit({ maxDistance: tuning.maxDistance });
      if (ev.last) rebuildDistance();
    });
  }

  const projection = pane.addFolder({ title: 'Projection', expanded: false });
  projection.addBinding(cameraComp, 'fov', { min: 20, max: 120, step: 1 });
  projection.addBinding(cameraComp, 'near', { min: 0.001, max: 5, step: 0.001 });
  projection.addBinding(cameraComp, 'far', { min: 10, max: 5000, step: 10 });

  position.value = readPosition();
  liveBindings.push(pane.addBinding(position, 'value', { label: 'position', readonly: true }));

  // Dragging in the viewport writes the same orbit state, so pull it back into the widgets —
  // but only while the pane is expanded, since a collapsed pane displays none of it.
  let frame = 0;
  const drive = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!pane.expanded) {
      return;
    }
    frame = requestAnimationFrame(function sync() {
      const live = control.getOrbitState();
      if (live) {
        view.distance = live.distance;
        view.azimuth = (live.azimuth * 180) / Math.PI;
        view.elevation = (live.elevation * 180) / Math.PI;
      }
      position.value = readPosition();
      distanceBinding?.refresh();
      for (const binding of liveBindings) {
        binding.refresh();
      }
      frame = requestAnimationFrame(sync);
    });
  };
  pane.on('fold', drive);
  drive();

  return () => {
    cancelAnimationFrame(frame);
    drag.destroy();
    pane.dispose();
    host.remove();
  };
}
