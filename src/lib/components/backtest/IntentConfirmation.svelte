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

<div class="flex flex-col gap-3">
  <hr class="border-none border-t border-black m-0" />
  <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-secondary m-0">ASLAN UNDERSTOOD</p>
  <p class="font-sans text-base text-text-primary leading-[1.6] m-0">{understand.event_spec.event_description}</p>
  <p class="flex items-center gap-2 flex-wrap m-0">
    <span class="font-sans text-sm text-text-secondary lowercase">{understand.event_spec.event_type}</span>
    <span class="text-sm text-text-muted select-none">·</span>
    <span class="font-mono text-sm text-text-secondary">{formatDate(understand.event_spec.date_range.start)} → {formatDate(understand.event_spec.date_range.end)}</span>
  </p>
  <div class="flex items-center gap-5 pt-1">
    <button
      type="button"
      class="px-5 py-[11px] border border-black bg-transparent text-text-primary font-sans text-base cursor-pointer rounded-none transition-colors duration-100 hover:bg-bg-elevated"
      onclick={onconfirm}
    >Run Backtest →</button>
    <button
      type="button"
      class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer underline decoration-black hover:text-text-primary hover:decoration-black"
      onclick={onrefine}
    >Refine query →</button>
  </div>
</div>
