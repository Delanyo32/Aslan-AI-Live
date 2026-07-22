<script lang="ts">
  import { SignIn } from 'svelte-clerk';
</script>

<div class="min-h-screen flex items-center justify-center bg-[#fcfbf9] px-6 py-16">
  <SignIn routing="hash" signUpUrl="/auth/register" fallbackRedirectUrl="/dashboard" />
</div>
