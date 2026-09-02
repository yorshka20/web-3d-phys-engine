import { Pane } from 'tweakpane';
import {
  applyAllHGRPPlacements,
  applyHGRPPlacement,
  hgrpStagePlacement,
  resetHGRPPlacement,
} from '../stages/hgrp/placement';
import { DebugTab } from './debugTabs';

// The Stage tab: the layout's global scale and, per character, its position offset, rotation
// and own scale (final scale = global x own). Widgets bind straight to the placement records
// and every change re-applies that character's transform (stages/hgrp/placement.ts); nothing
// is persisted — the layout is a viewing aid, not calibration state.
export function createHGRPStageTab(): DebugTab {
  return {
    id: 'hgrp-stage',
    label: 'Stage',
    mount: (container) => {
      const pane = new Pane({ container });

      pane
        .addBinding(hgrpStagePlacement, 'globalScale', { min: 0.1, max: 20, step: 0.1 })
        .on('change', applyAllHGRPPlacements);

      for (const placement of hgrpStagePlacement.characters) {
        const folder = pane.addFolder({ title: placement.label, expanded: true });
        const apply = () => applyHGRPPlacement(placement);

        for (const axis of ['x', 'y', 'z'] as const) {
          folder
            .addBinding(placement.offset, axis, { label: `offset ${axis}`, step: 0.05 })
            .on('change', apply);
        }
        for (const axis of ['x', 'y', 'z'] as const) {
          folder
            .addBinding(placement.rotation, axis, {
              label: `rotate ${axis}`,
              min: -180,
              max: 180,
              step: 1,
            })
            .on('change', apply);
        }
        folder
          .addBinding(placement, 'scale', { min: 0.1, max: 10, step: 0.05 })
          .on('change', apply);
        folder.addButton({ title: 'Reset' }).on('click', () => {
          resetHGRPPlacement(placement);
          pane.refresh();
        });
      }

      return () => pane.dispose();
    },
  };
}
