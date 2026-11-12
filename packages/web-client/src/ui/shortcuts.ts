// The one keyboard shortcut table. Every key the app answers to is declared here — with a
// handler when this module dispatches it, without one when another system already listens
// (the movement keys, the debug panel's P) — so the `?` list is complete and a new binding
// cannot silently take a key that is already in use.
//
// Keys are matched on `event.code` (layout-independent: a QWERTZ keyboard still has KeyZ
// where the hint says), except `?`, which has no code of its own.

export interface Shortcut {
  code: string;
  // What the hint shows for the key: 'F', 'Home', '1', '?'
  key: string;
  description: string;
  handler?: () => void;
}

const shortcuts: Shortcut[] = [];
let listening = false;

export function registerShortcut(shortcut: Shortcut): void {
  const taken = shortcuts.find((existing) => existing.code === shortcut.code);
  if (taken && (taken.handler || shortcut.handler)) {
    throw new Error(`[shortcuts] ${shortcut.key} is already bound to "${taken.description}"`);
  }
  if (taken) {
    taken.description = shortcut.description;
    return;
  }
  shortcuts.push(shortcut);
  if (!listening) {
    listening = true;
    window.addEventListener('keydown', dispatch);
  }
}

export function listShortcuts(): readonly Shortcut[] {
  return shortcuts;
}

// A key typed into a widget belongs to the widget
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return /INPUT|SELECT|TEXTAREA/.test(target.tagName) || target.isContentEditable;
}

function dispatch(event: KeyboardEvent): void {
  if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  const code = event.key === '?' ? 'Question' : event.code;
  const shortcut = shortcuts.find((entry) => entry.code === code);
  if (!shortcut?.handler) return;
  event.preventDefault();
  shortcut.handler();
}

// The keys other systems own, listed so the hint is complete. Registered on first import so
// a shortcut declared later cannot take them.
registerShortcut({ code: 'KeyW', key: 'W A S D', description: 'Move the camera target' });
registerShortcut({ code: 'Space', key: 'Space / C', description: 'Target up / down' });
registerShortcut({ code: 'ShiftLeft', key: 'Shift', description: 'Move faster' });
registerShortcut({ code: 'KeyT', key: 'T', description: 'Show or hide the orbit target marker' });

const HINT_STYLE = `
#shortcut-hint {
  position: fixed; bottom: 14px; right: 14px;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.7); color: #ddd;
  border: 1px solid #555; border-radius: 6px;
  font: bold 14px/1 'Courier New', monospace;
  cursor: pointer; z-index: 1000; user-select: none;
}
#shortcut-hint:hover { color: #fff; border-color: #999; }
#shortcut-list {
  position: fixed; bottom: 50px; right: 14px;
  min-width: 260px; max-height: calc(100vh - 80px); overflow-y: auto;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.88); color: #ddd;
  border: 1px solid #555; border-radius: 8px;
  font: 12px/1.6 'Courier New', monospace;
  z-index: 1001;
}
#shortcut-list[hidden] { display: none; }
#shortcut-list table { border-collapse: collapse; }
#shortcut-list td { padding: 1px 10px 1px 0; vertical-align: top; }
#shortcut-list td:first-child { color: #fff; font-weight: bold; white-space: nowrap; }
`;

/**
 * The on-screen key list: a `?` button in the corner and the `?` key open it. Built from the
 * table above at open time, so a shortcut registered later still appears.
 */
export function mountShortcutHint(): () => void {
  const style = document.createElement('style');
  style.textContent = HINT_STYLE;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'shortcut-hint';
  button.textContent = '?';
  button.title = 'Keyboard shortcuts';
  document.body.appendChild(button);

  const list = document.createElement('div');
  list.id = 'shortcut-list';
  list.hidden = true;
  document.body.appendChild(list);

  const toggle = () => {
    list.hidden = !list.hidden;
    if (list.hidden) return;
    const rows = listShortcuts()
      .map((entry) => `<tr><td>${entry.key}</td><td>${entry.description}</td></tr>`)
      .join('');
    list.innerHTML = `<table>${rows}</table>`;
  };
  button.addEventListener('click', toggle);
  registerShortcut({ code: 'Question', key: '?', description: 'This list', handler: toggle });
  registerShortcut({
    code: 'Escape',
    key: 'Esc',
    description: 'Close this list',
    handler: () => {
      list.hidden = true;
    },
  });

  return () => {
    button.remove();
    list.remove();
    style.remove();
  };
}
