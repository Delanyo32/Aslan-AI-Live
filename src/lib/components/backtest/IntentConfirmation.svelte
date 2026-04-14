<script lang="ts">
  import type { UnderstandResponse } from '$lib/types/pipeline';

  interface Props {
    understand: UnderstandResponse;
    onconfirm: () => void;
    onrefine: () => void;
  }

  let { understand, onconfirm, onrefine }: Props = $props();

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<div class="intent-confirmation">
  <hr class="divider" />
  <p class="section-label">ASLAN UNDERSTOOD</p>
  <p class="event-description">{understand.event_spec.event_description}</p>
  <p class="event-meta">
    <span class="event-type">{understand.event_spec.event_type}</span>
    <span class="meta-sep">·</span>
    <span class="date-range">{formatDate(understand.event_spec.date_range.start)} → {formatDate(understand.event_spec.date_range.end)}</span>
  </p>
  <div class="actions">
    <button type="button" class="confirm-btn" onclick={onconfirm}>Run Backtest →</button>
    <button type="button" class="refine-btn" onclick={onrefine}>Refine query →</button>
  </div>
</div>

<style>
  .intent-confirmation {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .divider {
    border: none;
    border-top: 1px solid var(--bg-border);
    margin: 0;
  }

  .section-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin: 0;
  }

  .event-description {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
  }

  .event-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0;
  }

  .event-type {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-transform: lowercase;
  }

  .meta-sep {
    font-size: var(--text-sm);
    color: var(--text-muted);
    user-select: none;
  }

  .date-range {
    font-family: 'IBM Plex Mono', 'IBM Plex Sans', monospace;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 20px;
    padding-top: 4px;
  }

  .confirm-btn {
    padding: 11px 20px;
    border: 1px solid var(--bg-border);
    background: transparent;
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    cursor: pointer;
    transition: background 100ms;
  }

  .confirm-btn:hover {
    background: var(--bg-elevated);
  }

  .refine-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .refine-btn:hover {
    color: var(--text-primary);
    text-decoration-color: var(--text-primary);
  }
</style>
