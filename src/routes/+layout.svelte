<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	// not found var?
	// svelte does not care
	// lets just ignore it for now
	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
