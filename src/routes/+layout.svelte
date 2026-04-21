<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/Aslan Finance Logo.svg';
  import ogImage from '$lib/assets/Aslan Finance Logo.png';
  import { Toaster } from 'svelte-sonner';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <meta property="og:image" content={ogImage} />
  <meta name="twitter:image" content={ogImage} />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<Toaster
  position="bottom-right"
  theme="light"
  toastOptions={{
    style: 'font-family: var(--font-sans, sans-serif); background: #fcfbf9; border: 1px solid #e5e5e5; color: #171717;'
  }}
/>

{@render children()}
