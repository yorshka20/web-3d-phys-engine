import { World } from '@ecs';
import { mount, unmount } from 'svelte';
import EntityPanel from './EntityPanel.svelte';
import { spawnEntity, SpawnConfig } from './entityFactory';

export function mountEntityPanel(world: World) {
  const host = document.createElement('div');
  host.id = 'entity-panel-host';
  document.body.appendChild(host);

  const state = $state({ visible: false });

  const app = mount(EntityPanel, {
    target: host,
    props: {
      get visible() {
        return state.visible;
      },
      set visible(v: boolean) {
        state.visible = v;
      },
      onConfirm: (cfg: SpawnConfig) => {
        spawnEntity(world, cfg);
      },
      onClose: () => {
        state.visible = false;
      },
      onOpen: () => {
        state.visible = true;
      },
    },
  });

  function handleKey(e: KeyboardEvent) {
    if (e.code !== 'KeyF') return;
    const target = e.target as HTMLElement | null;
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    state.visible = !state.visible;
  }
  window.addEventListener('keydown', handleKey);

  return () => {
    window.removeEventListener('keydown', handleKey);
    unmount(app);
    host.remove();
  };
}
