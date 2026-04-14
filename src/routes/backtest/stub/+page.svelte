<script lang="ts">
  // Dev convenience page — redirects to the seeded chip restrictions report.
  // Run `bun run db:seed` first to create it.
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  onMount(() => goto('/backtest/chip01', { replaceState: true }));
</script>

<p style="font-family: monospace; padding: 48px;">Redirecting to /backtest/chip01…</p>
