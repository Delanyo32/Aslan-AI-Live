<!--
  Editorial section rule: the paper's section marker set into a hairline, the
  way a printed journal opens a numbered section. One consistent device instead
  of a floating eyebrow above every heading.
-->
<script lang="ts">
  interface Props { marker: string; label: string }
  let { marker, label }: Props = $props()
</script>

<div class="flex items-center gap-3 mb-5" aria-hidden="true">
  <span class="font-mono text-[11px] text-[#4338ca]">{marker}</span>
  <span class="mono-label text-[10px] text-gray-500">{label}</span>
  <span class="flex-1 border-t border-[#e5e5e5]"></span>
</div>
