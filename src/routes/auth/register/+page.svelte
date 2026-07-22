<script lang="ts">
  import { SignUp } from 'svelte-clerk';
</script>

<div class="min-h-screen flex items-center justify-center bg-[#fcfbf9] px-6 py-16">
  <SignUp routing="hash" signInUrl="/auth/login" fallbackRedirectUrl="/dashboard" />
</div>
