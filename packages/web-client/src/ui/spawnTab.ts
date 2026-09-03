import { World } from '@ecs';
import { Pane } from 'tweakpane';
import { DEFAULT_SPAWN_CONFIG, SpawnableType, spawnEntity } from '../game/entityFactory';
import type { DebugTab } from './debugPanel';

const TYPES: SpawnableType[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'capsule'];

// The panel disposes this tab's pane whenever it goes off screen, so what the user dialled in
// lives here rather than in the widgets.
const config = { ...DEFAULT_SPAWN_CONFIG };

export function createSpawnTab(world: World): DebugTab {
  return {
    id: 'spawn',
    label: 'Create',
    mount: (container) => {
      const pane = new Pane({ container });
      pane.addBinding(config, 'type', {
        options: Object.fromEntries(TYPES.map((type) => [type, type])),
      });
      pane.addBinding(config, 'color');
      pane.addBinding(config, 'scale', { min: 0.1, max: 5, step: 0.1 });
      pane.addBinding(config, 'metallic', { min: 0, max: 1, step: 0.05 });
      pane.addBinding(config, 'roughness', { min: 0, max: 1, step: 0.05 });
      pane.addButton({ title: 'Spawn' }).on('click', () => spawnEntity(world, { ...config }));
      return () => pane.dispose();
    },
  };
}
