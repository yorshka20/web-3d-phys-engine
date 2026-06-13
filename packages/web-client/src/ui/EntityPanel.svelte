<script lang="ts">
  import { draggable } from './draggable';
  import { DEFAULT_SPAWN_CONFIG, type SpawnConfig, type SpawnableType } from './entityFactory';

  type Props = {
    visible: boolean;
    onConfirm: (cfg: SpawnConfig) => void;
    onClose: () => void;
    onOpen: () => void;
  };

  let { visible = $bindable(), onConfirm, onClose, onOpen }: Props = $props();

  const TYPES: SpawnableType[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'capsule'];

  let type = $state<SpawnableType>(DEFAULT_SPAWN_CONFIG.type);
  let color = $state(DEFAULT_SPAWN_CONFIG.color);
  let scale = $state(DEFAULT_SPAWN_CONFIG.scale);
  let metallic = $state(DEFAULT_SPAWN_CONFIG.metallic);
  let roughness = $state(DEFAULT_SPAWN_CONFIG.roughness);

  function confirm() {
    onConfirm({ type, color, scale, metallic, roughness });
  }

  function close() {
    onClose();
  }
</script>

{#if visible}
  <div class="panel" use:draggable={{ handle: '.panel-header' }}>
    <div class="panel-header">
      <span>Spawn Entity</span>
      <button class="close-btn" onclick={close} aria-label="Close">×</button>
    </div>

    <div class="panel-body">
      <label>
        <span>Type</span>
        <select bind:value={type}>
          {#each TYPES as t}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Color</span>
        <input type="color" bind:value={color} />
      </label>

      <label>
        <span>Scale ({scale.toFixed(2)})</span>
        <input type="range" min="0.1" max="5" step="0.1" bind:value={scale} />
      </label>

      <label>
        <span>Metallic ({metallic.toFixed(2)})</span>
        <input type="range" min="0" max="1" step="0.05" bind:value={metallic} />
      </label>

      <label>
        <span>Roughness ({roughness.toFixed(2)})</span>
        <input type="range" min="0" max="1" step="0.05" bind:value={roughness} />
      </label>

      <button class="confirm-btn" onclick={confirm}>Spawn</button>
      <div class="hint">Press <kbd>F</kbd> to toggle</div>
    </div>
  </div>
{:else}
  <button class="f-hint" onclick={onOpen} title="Press F to open spawn panel" aria-label="Open spawn panel">F</button>
{/if}

<style>
  .panel {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 260px;
    background: rgba(0, 0, 0, 0.85);
    color: #eee;
    border: 1px solid #333;
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    z-index: 1000;
    user-select: none;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid #333;
    border-radius: 8px 8px 0 0;
    font-weight: bold;
    color: #00ff88;
  }

  .close-btn {
    background: none;
    border: none;
    color: #eee;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }
  .close-btn:hover {
    color: #ff6b6b;
  }

  .panel-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    color: #aaa;
  }

  select,
  input[type='color'],
  input[type='range'] {
    width: 100%;
    background: #1e1e1e;
    color: #eee;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 4px;
    font: inherit;
  }
  input[type='color'] {
    height: 28px;
    padding: 2px;
  }

  .confirm-btn {
    margin-top: 4px;
    padding: 8px;
    background: #00ff88;
    color: #000;
    border: none;
    border-radius: 4px;
    font: inherit;
    font-weight: bold;
    cursor: pointer;
  }
  .confirm-btn:hover {
    background: #00cc6a;
  }

  .hint {
    text-align: center;
    color: #666;
    font-size: 11px;
    margin-top: 4px;
  }
  kbd {
    background: #333;
    border-radius: 3px;
    padding: 1px 4px;
    color: #eee;
  }

  .f-hint {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    color: #00ff88;
    border: 1px solid #00ff88;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    z-index: 1000;
    user-select: none;
    box-shadow: 0 0 8px rgba(0, 255, 136, 0.3);
    transition:
      background 0.15s,
      transform 0.15s;
  }
  .f-hint:hover {
    background: rgba(0, 255, 136, 0.15);
    transform: scale(1.05);
  }
</style>
