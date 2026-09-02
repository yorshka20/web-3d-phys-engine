import { World } from '@ecs';
import { Pane } from 'tweakpane';
import { DEFAULT_SPAWN_CONFIG, SpawnableType, spawnEntity } from '../game/entityFactory';
import { DebugTab } from './debugTabs';

const TYPES: SpawnableType[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'capsule'];

export function createSpawnTab(world: World): DebugTab {
  return {
    id: 'spawn',
    label: 'Create',
    mount: (container) => {
      const config = { ...DEFAULT_SPAWN_CONFIG };
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
