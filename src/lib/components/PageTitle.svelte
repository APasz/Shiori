<script lang="ts">
	let {
		eyebrow,
		title
	}: {
		eyebrow?: string;
		title: string;
	} = $props();
</script>

<div class="page-title">
	{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
	<h1>{title}</h1>
</div>

<style>
	.page-title {
		text-align: center;
	}

	h1,
	p {
		margin: 0;
	}

	h1 {
		font-size: clamp(1.75rem, 5vw, 2.5rem);
		letter-spacing: -0.045em;
		line-height: 1;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
	}
</style>
