<script lang="ts">
  import { Dialog } from 'bits-ui';

  interface Props {
    title: string;
    interest: string;
    onclose: () => void;
  }

  let { title, interest, onclose }: Props = $props();

  let open    = $state(true);
  let email   = $state('');
  let btnText = $state('Join waitlist →');
  let error   = $state('');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  $effect(() => {
    if (!open) onclose();
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';

    if (!EMAIL_RE.test(email)) {
      error = 'Enter a valid email address';
      return;
    }

    try {
      await fetch('/api/waitlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, interest }),
      });
    } catch {
      // best-effort — show success anyway
    }

    btnText = "You're on the list";
    email   = '';
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/60 z-[200]" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-bg-surface border border-bg-border p-8 max-w-[400px] w-[90%]"
    >
      <Dialog.Close
        class="absolute top-3 right-3.5 bg-transparent border-none text-text-muted text-sm cursor-pointer p-1 leading-none hover:text-text-primary"
        aria-label="Close"
      >
        ✕
      </Dialog.Close>

      <Dialog.Title class="font-sans text-base text-text-primary mb-5">
        {title}
      </Dialog.Title>

      <form onsubmit={handleSubmit}>
        <input
          class="w-full py-2.5 px-3 bg-bg-base border text-text-primary font-sans text-sm rounded-none outline-none focus:border-text-secondary {error ? 'border-accent-loss' : 'border-bg-border'}"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          autocomplete="email"
        />
        {#if error}
          <p class="text-xs text-accent-loss mt-1.5">{error}</p>
        {/if}
        <button
          class="mt-3 block w-full bg-transparent border border-bg-border text-text-primary font-sans text-sm py-2.5 px-4 cursor-pointer rounded-none transition-[background] duration-100 hover:not-disabled:bg-bg-elevated disabled:text-accent-gain disabled:border-accent-gain disabled:cursor-default disabled:opacity-85"
          type="submit"
          disabled={btnText !== 'Join waitlist →'}
        >
          {btnText}
        </button>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
