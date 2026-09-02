// Makes an element draggable by a handle (or by itself). Shaped as a Svelte action, but it
// is a plain function — call it directly on any element, including a tweakpane container.
// Usage: draggable(node, { handle: '.header' })
//
// A handle that is itself a button (tweakpane's title bar folds the pane when clicked) would
// fire that click at the end of a drag, so a drag that actually moved swallows the next
// click on the way out.
export function draggable(node: HTMLElement, params: { handle?: string } = {}) {
  const pos = { x: 0, y: 0 };
  let dragging = false;
  let moved = false;
  const offset = { x: 0, y: 0 };
  let handleEl: HTMLElement | null = null;

  // Find the handle element if specified
  function getHandle() {
    if (params.handle) {
      handleEl = node.querySelector(params.handle) as HTMLElement;
    } else {
      handleEl = node;
    }
  }
  getHandle();

  function setPosition(x: number, y: number) {
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.style.right = '';
  }

  function onMouseDown(e: MouseEvent) {
    // Only left mouse button
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    offset.x = e.clientX - node.offsetLeft;
    offset.y = e.clientY - node.offsetTop;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    moved = true;
    pos.x = e.clientX - offset.x;
    pos.y = e.clientY - offset.y;
    setPosition(pos.x, pos.y);
  }

  function swallowClick(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  function onMouseUp() {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (moved && handleEl) {
      handleEl.addEventListener('click', swallowClick, { capture: true, once: true });
    }
  }

  node.style.position = 'fixed';
  // Default position: top right corner. A drag writes `left`, so clear the right anchor or
  // the element would be pinned by both edges and stretch instead of move.
  if (!node.style.left && !node.style.right) {
    node.style.right = '10px';
  }
  if (!node.style.top) {
    node.style.top = '10px';
  }

  if (handleEl) {
    (handleEl as HTMLElement).style.cursor = 'move';
    (handleEl as HTMLElement).addEventListener('mousedown', onMouseDown);
  }

  return {
    update(newParams: { handle?: string }) {
      params = newParams;
      if (handleEl) handleEl.removeEventListener('mousedown', onMouseDown);
      getHandle();
      if (handleEl) handleEl.addEventListener('mousedown', onMouseDown);
    },
    destroy() {
      if (handleEl) handleEl.removeEventListener('mousedown', onMouseDown);
    },
  };
}
