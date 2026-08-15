<script lang="ts">
	import { artworkAssets, type ArtworkName } from './registry';

	let {
		name,
		label,
		size = '100%',
		stroke = 1.75,
		class: className = ''
	}: {
		name: ArtworkName;
		label?: string;
		size?: number | string;
		stroke?: number | string;
		class?: string;
	} = $props();

	const asset = $derived(artworkAssets[name]);
	const Renderer = $derived(asset.renderer);
	const isDecorative = $derived(label === undefined);
</script>

<Renderer
	aria-hidden={isDecorative}
	aria-label={label}
	class={`visual-artwork ${className}`}
	focusable={false}
	role={isDecorative ? undefined : 'img'}
	{size}
	{stroke}
/>
