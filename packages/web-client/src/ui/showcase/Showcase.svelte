<script lang="ts">
  import {
    applyLook,
    applyView,
    faceSubject,
    frameSubject,
    hideCharacter,
    hideUI,
    refreshPlayback,
    screenshot,
    seek,
    selectClip,
    setLoop,
    setPlaying,
    setSpeed,
    showCharacter,
    showcase,
  } from './state.svelte';

  const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

  let lookId = $state('studio');
  let viewId = $state('');
  let scrubbing = $state(false);
  let resumeAfterScrub = false;

  // The playhead follows the clip only while something is playing and the layer is on
  // screen; a paused clip, or a hidden layer, costs no frame work.
  $effect(() => {
    if (!showcase.playback.playing || showcase.hidden || scrubbing) return;
    let frame = requestAnimationFrame(function tick() {
      refreshPlayback();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  const onScrubStart = () => {
    scrubbing = true;
    resumeAfterScrub = showcase.playback.playing;
    if (resumeAfterScrub) setPlaying(false);
  };
  const onScrubEnd = () => {
    scrubbing = false;
    if (resumeAfterScrub) setPlaying(true);
  };
  const onScrub = (event: Event) => {
    seek(Number((event.currentTarget as HTMLInputElement).value));
  };

  const clock = (seconds: number) => {
    const whole = Math.max(0, seconds);
    const minutes = Math.floor(whole / 60);
    return `${minutes}:${(whole - minutes * 60).toFixed(2).padStart(5, '0')}`;
  };

  // One tick per second along the rail, so a clip's length reads at a glance
  const tickBackground = $derived(
    showcase.playback.duration > 0
      ? `repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px ${
          100 / showcase.playback.duration
        }%)`
      : 'none',
  );

  const clipTitle = (clip: { name: string; own: boolean; drivesBody: boolean }) =>
    clip.drivesBody ? clip.name : `${clip.name} (overlay)`;
</script>

<div class="showcase" class:hidden={showcase.hidden}>
  <header class="top">
    <div class="title">
      <span class="brand">Endfield viewer</span>
      {#if showcase.subjectLabel}
        <span class="subject">{showcase.subjectLabel}</span>
      {/if}
    </div>
    <div class="tools">
      <label>
        <span>Look</span>
        <select bind:value={lookId} onchange={() => applyLook(lookId)}>
          {#each showcase.looks as look (look.id)}
            <option value={look.id}>{look.builtin ? look.label : `${look.label} (saved)`}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>View</span>
        <select
          bind:value={viewId}
          onchange={() => {
            if (viewId) applyView(viewId);
            viewId = '';
          }}
        >
          <option value="">…</option>
          {#each showcase.views as view (view.id)}
            <option value={view.id}>{view.key ? `${view.label} (${view.key})` : view.label}</option>
          {/each}
        </select>
      </label>
      <button type="button" onclick={frameSubject} title="F">Frame</button>
      <button type="button" onclick={faceSubject} title="G">Face</button>
      <button type="button" onclick={screenshot}>Save image</button>
      <button type="button" onclick={hideUI} title="H">Hide panels</button>
    </div>
  </header>

  <nav class="roster" aria-label="Characters">
    {#each showcase.characters as character (character.assetId)}
      <div class="chip" class:on={character.onStage} class:focused={character.focused}>
        <button
          type="button"
          class="name"
          class:loading={character.loading}
          onclick={() => showCharacter(character.assetId)}
          title={character.onStage ? 'Focus' : 'Load and focus'}
        >
          {character.label}
        </button>
        {#if character.onStage}
          <button
            type="button"
            class="off"
            onclick={() => hideCharacter(character.assetId)}
            title="Take off stage"
            aria-label="Take {character.label} off stage"
          >
            ×
          </button>
        {/if}
      </div>
    {/each}
  </nav>

  {#if showcase.subject}
    <footer class="transport">
      <div class="row">
        <select
          class="clip"
          value={showcase.playback.clip}
          onchange={(event) => selectClip((event.currentTarget as HTMLSelectElement).value)}
          aria-label="Clip"
        >
          {#if !showcase.clips.some((clip) => clip.name === showcase.playback.clip)}
            <option value={showcase.playback.clip}>{showcase.playback.clip || 'Bind pose'}</option>
          {/if}
          {#each showcase.clips as clip (clip.name)}
            <option value={clip.name}>{clipTitle(clip)}</option>
          {/each}
        </select>
        <div class="controls">
          <button
            type="button"
            class="play"
            onclick={() => setPlaying(!showcase.playback.playing)}
            aria-label={showcase.playback.playing ? 'Pause' : 'Play'}
          >
            {showcase.playback.playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            class:active={showcase.playback.loop}
            onclick={() => setLoop(!showcase.playback.loop)}
            aria-pressed={showcase.playback.loop}
          >
            Loop
          </button>
          <div class="speeds" role="group" aria-label="Speed">
            {#each SPEEDS as speed (speed)}
              <button
                type="button"
                class:active={Math.abs(showcase.playback.speed - speed) < 1e-6}
                onclick={() => setSpeed(speed)}
              >
                {speed}×
              </button>
            {/each}
          </div>
        </div>
      </div>
      <div class="rail" style:background={tickBackground}>
        <div
          class="fill"
          style:width="{showcase.playback.duration > 0
            ? (100 * showcase.playback.time) / showcase.playback.duration
            : 0}%"
        ></div>
        <input
          type="range"
          min="0"
          max={Math.max(showcase.playback.duration, 0.001)}
          step="0.001"
          value={showcase.playback.time}
          oninput={onScrub}
          onpointerdown={onScrubStart}
          onpointerup={onScrubEnd}
          onpointercancel={onScrubEnd}
          onkeydown={(event) => event.stopPropagation()}
          aria-label="Time"
        />
      </div>
      <div class="clock">
        <span>{clock(showcase.playback.time)}</span>
        <span>{clock(showcase.playback.duration)}</span>
      </div>
    </footer>
  {/if}
</div>

<style>
  .showcase {
    --ink: #eceae4;
    --mute: #9aa0a8;
    --accent: #f2c21b;
    --panel: rgba(18, 20, 24, 0.78);
    --line: rgba(255, 255, 255, 0.14);
    position: fixed;
    inset: 0;
    pointer-events: none;
    color: var(--ink);
    font-family:
      'Avenir Next',
      'Segoe UI Variable',
      'Segoe UI',
      Inter,
      system-ui,
      sans-serif;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    z-index: 900;
  }
  .showcase.hidden {
    display: none;
  }
  .showcase > * {
    pointer-events: auto;
  }
  button,
  select {
    font: inherit;
    color: inherit;
  }
  button {
    background: none;
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 4px 10px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--mute);
  }
  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  select {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 4px 8px;
  }
  select option {
    background: #1b1d22;
  }

  /* Top bar: the name of what is on screen on the left, the tools on the right */
  .top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 16px;
    background: linear-gradient(to bottom, rgba(12, 13, 16, 0.7), transparent);
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 14px;
    white-space: nowrap;
  }
  .brand {
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .subject {
    color: var(--accent);
    font-weight: 500;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
    /* Leave the top-right corner to the debug panel's hint and pane */
    margin-right: 48px;
  }
  .tools label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--mute);
  }

  /* Left edge: one line per character; a bar at the left says whether it is on stage, and
     the focused one carries the accent */
  .roster {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    max-height: 70vh;
    overflow-y: auto;
    scrollbar-width: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
  }
  .roster::-webkit-scrollbar {
    width: 0;
  }
  .chip {
    display: flex;
    align-items: center;
    border-left: 2px solid transparent;
    color: var(--mute);
  }
  .chip.on {
    border-left-color: var(--line);
    color: var(--ink);
  }
  .chip.focused {
    border-left-color: var(--accent);
    color: var(--accent);
  }
  .chip .name {
    border: none;
    padding: 4px 10px 4px 12px;
    text-align: left;
    min-width: 96px;
  }
  .chip .name.loading {
    animation: pulse 1.1s ease-in-out infinite;
  }
  .chip .off {
    border: none;
    padding: 2px 6px;
    color: var(--mute);
    opacity: 0;
  }
  .chip:hover .off,
  .chip .off:focus-visible {
    opacity: 1;
  }
  .chip .off:hover {
    color: var(--ink);
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip .name.loading {
      animation: none;
      opacity: 0.6;
    }
  }

  /* Bottom: the clip transport. The rail runs the full width, with a tick per second */
  .transport {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 10px 56px 10px 16px;
    background: linear-gradient(to top, rgba(12, 13, 16, 0.82), transparent);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 8px;
  }
  .clip {
    font-size: 17px;
    font-weight: 500;
    background: none;
    border: none;
    padding: 2px 0;
    max-width: 50vw;
    text-overflow: ellipsis;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .play {
    min-width: 44px;
    font-size: 14px;
  }
  .speeds {
    display: flex;
    gap: 0;
  }
  .speeds button {
    border-radius: 0;
    margin-left: -1px;
    padding: 4px 8px;
  }
  .speeds button:first-child {
    border-radius: 3px 0 0 3px;
  }
  .speeds button:last-child {
    border-radius: 0 3px 3px 0;
  }
  .rail {
    position: relative;
    height: 14px;
    border-top: 1px solid var(--line);
  }
  .fill {
    position: absolute;
    left: 0;
    top: -1px;
    height: 3px;
    background: var(--accent);
    pointer-events: none;
  }
  .rail input {
    position: absolute;
    inset: 0;
    width: 100%;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;
  }
  .rail input::-webkit-slider-runnable-track {
    height: 14px;
    background: transparent;
  }
  .rail input::-webkit-slider-thumb {
    appearance: none;
    width: 4px;
    height: 14px;
    background: var(--ink);
    border-radius: 1px;
  }
  .rail input::-moz-range-track {
    height: 14px;
    background: transparent;
  }
  .rail input::-moz-range-thumb {
    width: 4px;
    height: 14px;
    background: var(--ink);
    border: none;
    border-radius: 1px;
  }
  .clock {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    color: var(--mute);
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .tools {
      display: none;
    }
    .transport {
      padding-right: 16px;
    }
    .clip {
      font-size: 14px;
    }
  }
</style>
