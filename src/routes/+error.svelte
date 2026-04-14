<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
  <p class="font-mono text-sm text-text-secondary m-0">{$page.status}</p>
  <p class="font-sans text-base text-text-primary m-0">{$page.status === 404 ? "This page doesn't exist." : $page.status >= 500 ? "Something went wrong on our end. Try refreshing." : "Something went wrong."}</p>
  <a
    href="/"
    class="font-sans text-sm text-text-secondary no-underline hover:text-text-primary transition-colors duration-100"
  >← Back to homepage</a>
</div>
