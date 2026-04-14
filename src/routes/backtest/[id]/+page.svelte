<script lang="ts">
  import BacktestReport from '$lib/components/backtest/BacktestReport.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta property="og:title" content={data.meta.title} />
  <meta property="og:description" content={data.meta.description} />
  <meta property="og:url" content={data.meta.url} />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={data.meta.title} />
  <meta name="twitter:description" content={data.meta.description} />
</svelte:head>

<BacktestReport report={data.report} viewContext={data.viewContext} backTo={data.backTo} low_confidence_events={data.low_confidence_events} userCredits={data.userCredits} />
