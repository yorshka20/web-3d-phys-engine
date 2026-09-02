import { debugTabs } from './debugTabs';
import { draggable } from './draggable';

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

export function mountDebugPanel(): () => void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<div class="dp-header"><span>Debug</span>' +
    '<button class="dp-close" aria-label="Close">×</button></div>' +
    '<div class="dp-main"><div class="dp-rail"></div><div class="dp-content"></div></div>';
  document.body.appendChild(panel);

  const hint = document.createElement('button');
  hint.id = 'debug-panel-hint';
  hint.textContent = 'P';
  hint.title = 'Press P to open the debug panel';
  document.body.appendChild(hint);

  const rail = panel.querySelector('.dp-rail') as HTMLElement;
  const content = panel.querySelector('.dp-content') as HTMLElement;
  const drag = draggable(panel, { handle: '.dp-header' });

  // Tabs build once and stay in the DOM, hidden when inactive: a tweakpane tree rebuilt on
  // every switch would lose the folder state the user just arranged.
  const disposers: (() => void)[] = [];
  const buttons: HTMLButtonElement[] = [];
  const panes: HTMLElement[] = [];

  debugTabs().forEach((tab, index) => {
    const button = document.createElement('button');
    button.className = 'dp-tab';
    button.textContent = tab.label;
    rail.appendChild(button);
    buttons.push(button);

    const paneHost = document.createElement('div');
    paneHost.className = 'dp-pane';
    content.appendChild(paneHost);
    panes.push(paneHost);
    disposers.push(tab.mount(paneHost));

    button.addEventListener('click', () => select(index));
  });

  function select(index: number) {
    buttons.forEach((button, i) => button.classList.toggle('active', i === index));
    panes.forEach((pane, i) => (pane.hidden = i !== index));
  }
  if (buttons.length > 0) {
    select(0);
  }

  const setVisible = (visible: boolean) => {
    panel.hidden = !visible;
    hint.hidden = visible;
  };
  setVisible(false);

  hint.addEventListener('click', () => setVisible(true));
  (panel.querySelector('.dp-close') as HTMLElement).addEventListener('click', () =>
    setVisible(false),
  );

  function handleKey(e: KeyboardEvent) {
    if (e.code !== 'KeyP') return;
    const target = e.target as HTMLElement | null;
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    setVisible(panel.hidden);
  }
  window.addEventListener('keydown', handleKey);

  return () => {
    window.removeEventListener('keydown', handleKey);
    for (const dispose of disposers) {
      dispose();
    }
    drag.destroy();
    panel.remove();
    hint.remove();
    style.remove();
  };
}
