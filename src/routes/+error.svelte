<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <p class="status mono">{$page.status}</p>
  <p class="message">{$page.status === 404 ? "This page doesn't exist." : $page.status >= 500 ? "Something went wrong on our end. Try refreshing." : "Something went wrong."}</p>
  <a href="/" class="back-link">← Back to homepage</a>
</div>

<style>
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 16px;
    text-align: center;
  }

  .status {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .message {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    margin: 0;
  }

  .back-link {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-decoration: none;
  }

  .back-link:hover {
    color: var(--text-primary);
  }
</style>
