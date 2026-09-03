import { draggable } from './draggable';

// Tabs contributed to the single debug panel (toggled with P). A stage registers whatever
// belongs to it — the PMX shading params, the HGRP calibration knobs — so nothing mounts for
// content the running stage may not even have loaded.
//
// A tab mounts lazily into the container the panel hands it, the first time it is shown:
// tweakpane builds a whole widget tree per material, which is wasted on a tab nobody opens.
export interface DebugTab {
  id: string;
  label: string;
  // `onVisibleFrame` registers a per-frame callback the panel drives only while this tab is
  // the visible one — a tab must not hold a requestAnimationFrame loop of its own, or it keeps
  // repainting widgets nobody is looking at.
  mount: (container: HTMLElement, onVisibleFrame: (tick: () => void) => void) => () => void;
}

// Registering the first tab is what brings the panel into existence: the shell has no content
// of its own, and whoever owns content (a stage) is the only one who knows it exists. Ordering
// therefore cannot go wrong — there is no "registered too late to be picked up" window.
export function registerDebugTab(tab: DebugTab): void {
  (panel ??= createDebugPanel()).addTab(tab);
}

// The panel is a shell only — position, drag handle, tab rail and scrolling. Every tab's
// content is a tweakpane Pane built by whoever registered it; nothing here hand-rolls a
// widget, because a hand-rolled slider is a worse slider.
//
// The rail is a narrow vertical strip with rotated labels, the way Blender stacks its
// sidebar tabs: tabs accumulate (one per stage plus the built-ins) and a horizontal strip
// runs out of room after three or four, while a vertical one costs ~26px of width no matter
// how many there are.
const STYLE = `
#debug-panel {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 380px;
  max-height: calc(100vh - 20px);
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #333;
  border-radius: 8px;
  color: #eee;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 1000;
}
#debug-panel[hidden], #debug-panel-hint[hidden] { display: none; }
#debug-panel .dp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid #333;
  border-radius: 8px 8px 0 0;
  font-weight: bold;
  color: #00ff88;
  user-select: none;
}
#debug-panel .dp-close {
  background: none; border: none; color: #eee;
  font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px;
}
#debug-panel .dp-close:hover { color: #ff6b6b; }
#debug-panel .dp-main { display: flex; min-height: 0; }
#debug-panel .dp-rail {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 0 0 auto;
  border-right: 1px solid #333;
  padding: 6px 0 6px 4px;
  gap: 3px;
  user-select: none;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
#debug-panel .dp-rail::-webkit-scrollbar { width: 0; }
#debug-panel .dp-tab {
  /* Bottom-to-top labels: vertical-rl alone reads top-to-bottom, the 180 turn flips it */
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  padding: 10px 4px;
  background: rgba(255, 255, 255, 0.04);
  color: #888;
  border: none;
  border-radius: 4px 0 0 4px;
  font: inherit;
  letter-spacing: 0.5px;
  cursor: pointer;
  white-space: nowrap;
}
#debug-panel .dp-tab:hover { color: #ccc; background: rgba(255, 255, 255, 0.08); }
#debug-panel .dp-tab.active {
  color: #00ff88;
  background: rgba(0, 255, 136, 0.12);
  box-shadow: inset -2px 0 0 #00ff88;
}
/* Scroll without a visible bar: the panel is an overlay and a scrollbar gutter eats width */
#debug-panel .dp-content {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 6px;
}
#debug-panel .dp-content::-webkit-scrollbar { width: 0; height: 0; }
#debug-panel .dp-pane[hidden] { display: none; }
#debug-panel-hint {
  position: fixed; top: 10px; right: 10px;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  color: #00ff88; border: 1px solid #00ff88; border-radius: 6px;
  font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold;
  cursor: pointer; z-index: 1000; user-select: none;
  box-shadow: 0 0 8px rgba(0, 255, 136, 0.3);
}
#debug-panel-hint:hover { background: rgba(0, 255, 136, 0.15); }
`;

interface TabEntry {
  tab: DebugTab;
  button: HTMLButtonElement;
  host: HTMLElement;
  ticks: (() => void)[];
  dispose?: () => void;
}

interface DebugPanel {
  addTab(tab: DebugTab): void;
}

let panel: DebugPanel | undefined;

function createDebugPanel(): DebugPanel {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panelElement = document.createElement('div');
  panelElement.id = 'debug-panel';
  panelElement.hidden = true;
  panelElement.innerHTML =
    '<div class="dp-header"><span>Debug</span>' +
    '<button class="dp-close" aria-label="Close">×</button></div>' +
    '<div class="dp-main"><div class="dp-rail"></div><div class="dp-content"></div></div>';
  document.body.appendChild(panelElement);

  const hint = document.createElement('button');
  hint.id = 'debug-panel-hint';
  hint.textContent = 'P';
  hint.title = 'Press P to open the debug panel';
  document.body.appendChild(hint);

  const rail = panelElement.querySelector('.dp-rail') as HTMLElement;
  const content = panelElement.querySelector('.dp-content') as HTMLElement;
  draggable(panelElement, { handle: '.dp-header' });

  const entries: TabEntry[] = [];
  let activeIndex = 0;
  let visible = false;
  let frame = 0;

  // Exactly one tab's widget tree exists at a time, and only while the panel is open: a pane
  // off screen is pure cost — a fully built HGRP character tab is ~18k DOM nodes and ~12k
  // listeners. What the user arranged is remembered as data (lazyFolder's expansion map), so
  // rebuilding restores the same view instead of a default one.
  function ensureMounted(entry: TabEntry): void {
    if (entry.dispose) {
      return;
    }
    entry.dispose = entry.tab.mount(entry.host, (tick) => entry.ticks.push(tick));
  }

  function unmount(entry: TabEntry): void {
    entry.dispose?.();
    entry.dispose = undefined;
    entry.ticks.length = 0;
    entry.host.replaceChildren();
  }

  // One loop for the whole panel, running only for the tab actually on screen.
  function drive(): void {
    cancelAnimationFrame(frame);
    frame = 0;
    const entry = entries[activeIndex];
    if (!visible || !entry || entry.ticks.length === 0) {
      return;
    }
    frame = requestAnimationFrame(function tick() {
      for (const run of entry.ticks) {
        run();
      }
      frame = requestAnimationFrame(tick);
    });
  }

  function select(index: number): void {
    activeIndex = index;
    entries.forEach((entry, i) => {
      entry.button.classList.toggle('active', i === index);
      entry.host.hidden = i !== index;
      if (i !== index) {
        unmount(entry);
      }
    });
    if (visible && entries[index]) {
      ensureMounted(entries[index]);
    }
    drive();
  }

  function setVisible(next: boolean): void {
    visible = next;
    panelElement.hidden = !next;
    hint.hidden = next;
    const entry = entries[activeIndex];
    if (entry) {
      if (next) {
        ensureMounted(entry);
      } else {
        unmount(entry);
      }
    }
    drive();
  }

  function addTab(tab: DebugTab): void {
    const existing = entries.findIndex((entry) => entry.tab.id === tab.id);
    if (existing >= 0) {
      const entry = entries[existing];
      unmount(entry);
      entry.tab = tab;
      entry.button.textContent = tab.label;
      select(activeIndex);
      return;
    }

    const button = document.createElement('button');
    button.className = 'dp-tab';
    button.textContent = tab.label;
    rail.appendChild(button);

    const host = document.createElement('div');
    host.className = 'dp-pane';
    content.appendChild(host);

    const entry: TabEntry = { tab, button, host, ticks: [] };
    entries.push(entry);
    button.addEventListener('click', () => select(entries.indexOf(entry)));
    select(activeIndex);
  }

  hint.addEventListener('click', () => setVisible(true));
  (panelElement.querySelector('.dp-close') as HTMLElement).addEventListener('click', () =>
    setVisible(false),
  );
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code !== 'KeyP') return;
    const target = e.target as HTMLElement | null;
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    setVisible(panelElement.hidden);
  });

  return { addTab };
}
