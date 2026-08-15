<script lang="ts">
	import { iconAssets, type IconName } from './registry';

	let {
		name,
		label,
		size = '1em',
		stroke = 2,
		class: className = ''
	}: {
		name: IconName;
		label?: string;
		size?: number | string;
		stroke?: number | string;
		class?: string;
	} = $props();

	const asset = $derived(iconAssets[name]);
	const Renderer = $derived(asset.renderer);
	const isDecorative = $derived(label === undefined);
</script>

<Renderer
	aria-hidden={isDecorative}
	aria-label={label}
	class={`visual-icon ${className}`}
	focusable={false}
	role={isDecorative ? undefined : 'img'}
	{size}
	{stroke}
/>
