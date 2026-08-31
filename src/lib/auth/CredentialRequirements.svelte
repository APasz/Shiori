<script lang="ts">
	import { passwordRequirementsMessage } from '$lib/auth/password-policy';
	import { usernameRequirementsMessage } from '$lib/auth/username-policy';

	type CredentialKind = 'password' | 'username';

	let { kind }: { kind: CredentialKind } = $props();

	const requirement = $derived(kind === 'username' ? usernameRequirementsMessage : passwordRequirementsMessage());
</script>

<small class="shiori-credential-requirements">{requirement}</small>
