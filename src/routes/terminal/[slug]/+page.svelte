<script lang="ts">
  import TerminalReport from '$lib/components/terminal/TerminalReport.svelte';
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

<TerminalReport report={data.report} isOwner={data.isOwner} ledger={data.ledger} />
