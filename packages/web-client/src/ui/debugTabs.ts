// Tabs contributed to the single debug panel (toggled with P). A stage registers whatever
// belongs to it — the PMX shading params, the HGRP calibration knobs — so main.ts no longer
// mounts panels for content the running stage may not even have loaded.
//
// A tab mounts lazily into the container the panel hands it, the first time it is shown:
// tweakpane builds a whole widget tree per material, which is wasted on a tab nobody opens.
export interface DebugTab {
  id: string;
  label: string;
  mount: (container: HTMLElement) => () => void;
}

const tabs: DebugTab[] = [];

export function registerDebugTab(tab: DebugTab): void {
  const existing = tabs.findIndex((entry) => entry.id === tab.id);
  if (existing >= 0) {
    tabs[existing] = tab;
    return;
  }
  tabs.push(tab);
}

export function debugTabs(): readonly DebugTab[] {
  return tabs;
}

export function clearDebugTabs(): void {
  tabs.length = 0;
}
