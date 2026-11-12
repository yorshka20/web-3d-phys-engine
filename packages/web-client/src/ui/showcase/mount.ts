import { World } from '@ecs';
import { mount, unmount } from 'svelte';
import { installUIVisibility } from '../visibility';
import Showcase from './Showcase.svelte';
import { connectShowcase } from './state.svelte';

/**
 * The showcase overlay (ui/showcase/Showcase.svelte): what a visitor uses to put a
 * character on screen and play its clips, as opposed to the debug panel's calibration tabs.
 * Mounted by the stage that has characters to show, the way the stage registers its tabs.
 */
export function mountShowcase(world: World): () => void {
  installUIVisibility();
  const host = document.createElement('div');
  host.id = 'showcase-root';
  document.body.appendChild(host);
  const disconnect = connectShowcase(world);
  const component = mount(Showcase, { target: host });
  return () => {
    void unmount(component);
    disconnect();
    host.remove();
  };
}
