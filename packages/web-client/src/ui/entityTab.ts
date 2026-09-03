import type { Entity, World } from '@ecs';
import { FolderApi, Pane } from 'tweakpane';
import type { DebugTab } from './debugPanel';
import { buildEntityInspector, hasInspectableComponent } from './inspector/registry';
import { lazyFolder } from './lazyFolder';

// Every entity the world holds that declares an inspectable component, one folder each. The
// tab is stage-independent on purpose: what it lists comes from the world, and the entities
// main.ts creates (plane, coordinate, camera) belong to no stage.
export function createEntityTab(world: World): DebugTab {
  return {
    id: 'entities',
    label: 'Entities',
    mount: (container) => mountPane(container, world),
  };
}

function mountPane(container: HTMLElement, world: World): () => void {
  const pane = new Pane({ container });
  let folders: FolderApi[] = [];

  // Entities come and go while the tab is open (the Create tab spawns them, HGRP characters
  // load on demand), so the list is re-read on demand rather than watched.
  const rebuild = (): void => {
    for (const folder of folders) {
      pane.remove(folder);
    }
    folders = world
      .getEntitiesByCondition(hasInspectableComponent)
      .map((entity) =>
        lazyFolder(pane, { title: entityTitle(entity), key: `entity:${entity.id}` }, (folder) =>
          buildEntityInspector(folder, entity),
        ),
      );
  };

  pane.addButton({ title: 'Refresh list' }).on('click', rebuild);
  rebuild();

  return () => pane.dispose();
}

function entityTitle(entity: Entity): string {
  const label = entity.getLabel();
  return label ? `${label} (${entity.type})` : `${entity.type} #${entity.numericId}`;
}
