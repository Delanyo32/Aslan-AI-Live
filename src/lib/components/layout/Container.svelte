<script lang="ts">
  let { children } = $props();
</script>

<div class="container">
  {@render children()}
</div>

<style>
  .container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
  }

  @media (max-width: 640px) {
    .container {
      padding: 0 16px;
    }
  }
</style>
