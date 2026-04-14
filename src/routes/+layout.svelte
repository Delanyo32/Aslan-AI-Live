<script lang="ts">
  import '../app.css';
  import Container from '$lib/components/layout/Container.svelte';
  import favicon from '$lib/assets/favicon.svg';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<Container>
  {@render children()}
</Container>
