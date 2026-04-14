<script lang="ts">
  let { children } = $props();
</script>

<div class="max-w-[1100px] mx-auto px-6 max-sm:px-4">
  {@render children()}
</div>
