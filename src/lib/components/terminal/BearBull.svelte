<script lang="ts">
  interface Props {
    bearBull: { bear: string; bull: string } | null;
  }

  let { bearBull }: Props = $props();
</script>

{#if bearBull}
  <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="bg-white border border-[#e5e5e5] rounded-[2rem] p-8 md:p-10">
      <div class="flex items-center gap-2 mb-5">
        <span class="w-2 h-2 rounded-full bg-red-500"></span>
        <span class="mono-label text-[10px] text-gray-400">Bear case from the evidence</span>
      </div>
      <p class="font-serif text-lg text-gray-800 leading-relaxed whitespace-pre-line">{bearBull.bear}</p>
    </div>
    <div class="bg-white border border-[#e5e5e5] rounded-[2rem] p-8 md:p-10">
      <div class="flex items-center gap-2 mb-5">
        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
        <span class="mono-label text-[10px] text-gray-400">Bull case from the evidence</span>
      </div>
      <p class="font-serif text-lg text-gray-800 leading-relaxed whitespace-pre-line">{bearBull.bull}</p>
    </div>
  </section>
{/if}
