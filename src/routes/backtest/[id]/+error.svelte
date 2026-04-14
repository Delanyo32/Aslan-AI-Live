<div class="error-page">
  <p class="message">This report doesn't exist or has been made private.</p>
  <a href="/" class="back-link">← Run your own backtest</a>
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

  .message {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-secondary);
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
