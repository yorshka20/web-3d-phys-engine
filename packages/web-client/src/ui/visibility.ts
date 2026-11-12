import { registerShortcut } from './shortcuts';

// One switch hides every overlay — the showcase, the debug panel and its hint, the camera
// pane, the key list — so the picture can be looked at and captured bare. CSS does the
// hiding: each overlay root is listed here, and the body class is the only state.
const HIDDEN_CLASS = 'ui-hidden';

const STYLE = `
body.${HIDDEN_CLASS} #showcase-root,
body.${HIDDEN_CLASS} #debug-panel,
body.${HIDDEN_CLASS} #debug-panel-hint,
body.${HIDDEN_CLASS} #camera-panel-host,
body.${HIDDEN_CLASS} #shortcut-hint,
body.${HIDDEN_CLASS} #shortcut-list { display: none !important; }
`;

const listeners = new Set<(hidden: boolean) => void>();

export function isUIHidden(): boolean {
  return document.body.classList.contains(HIDDEN_CLASS);
}

export function setUIHidden(hidden: boolean): void {
  document.body.classList.toggle(HIDDEN_CLASS, hidden);
  for (const listener of listeners) listener(hidden);
}

export function onUIHiddenChange(listener: (hidden: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let installed = false;

export function installUIVisibility(): void {
  if (installed) return;
  installed = true;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  registerShortcut({
    code: 'KeyH',
    key: 'H',
    description: 'Hide or show every panel',
    handler: () => setUIHidden(!isUIHidden()),
  });
}
