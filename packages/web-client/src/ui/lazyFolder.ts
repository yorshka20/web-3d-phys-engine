import { FolderApi, Pane } from 'tweakpane';

// Which folders the user has open, by key. The debug panel disposes a tab's pane the moment it
// goes off screen, so the arrangement has to survive as data — keeping the widget tree alive
// just to remember six booleans is what made a closed panel cost thousands of listeners.
const expandedFolders = new Map<string, boolean>();

/**
 * A folder whose contents are built the first time it is expanded, and whose open/closed state
 * outlives the pane.
 *
 * tweakpane materializes a folder's whole widget tree at `addBinding` time — `expanded: false`
 * only animates the height to zero, it does not save a single node. Measured on tweakpane
 * 4.0.5: a float slider costs 22 DOM nodes / 13 listeners, a float-rgba color picker 80 / 66
 * (it is a full SV palette plus hue, alpha and four text inputs), so one collapsed HGRP
 * material folder still costs ~980 nodes and ~830 listeners.
 *
 * When `build` runs from the fold event, adding children resets the folder's fixed transition
 * height back to `auto` (tweakpane's FolderController listens for rack 'add'), so the folder
 * sizes itself correctly — the first expand just does not animate.
 */
export function lazyFolder(
  parent: Pane | FolderApi,
  params: { title: string; key: string; expanded?: boolean },
  build: (folder: FolderApi) => void,
): FolderApi {
  const expanded = expandedFolders.get(params.key) ?? params.expanded ?? false;
  const folder = parent.addFolder({ title: params.title, expanded });
  let built = false;
  const buildOnce = () => {
    if (built) {
      return;
    }
    built = true;
    build(folder);
  };
  folder.on('fold', (ev) => {
    expandedFolders.set(params.key, ev.expanded);
    if (ev.expanded) {
      buildOnce();
    }
  });
  if (expanded) {
    buildOnce();
  }
  return folder;
}
