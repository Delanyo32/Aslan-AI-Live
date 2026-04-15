<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { Toaster } from 'svelte-sonner';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<Toaster
  position="bottom-right"
  theme="light"
  toastOptions={{
    style: 'font-family: var(--font-sans, sans-serif); background: #fcfbf9; border: 1px solid #e5e5e5; color: #171717;'
  }}
/>

{@render children()}
