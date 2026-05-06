<script lang="ts">
	import { Button, Label, Select, Checkbox } from 'flowbite-svelte';
	import { CloseOutline } from 'flowbite-svelte-icons';
	import type { ImageDocument } from '$lib/modules/image';
	import type { CanvasManager } from '$lib/modules/canvas';
	import {
		createDefaultLevelsState,
		calculateHistogram,
		calculateCombinedLUTs,
		type LevelsProcessingState
	} from '$lib/modules/image/levels';

	interface Props {
		open: boolean;
		document: ImageDocument | null;
		canvasManager: CanvasManager | null;
		onClose: () => void;
		onApply: () => void;
	}

	let { open = $bindable(), document, canvasManager, onClose, onApply }: Props = $props();

	let channels = [
		{ value: 'master', name: 'Master (RGB)' },
		{ value: 'r', name: 'Red' },
		{ value: 'g', name: 'Green' },
		{ value: 'b', name: 'Blue' },
		{ value: 'a', name: 'Alpha' }
	];

	let selectedChannel = $state('master');
	let previewEnabled = $state(true);
	let isLogarithmic = $state(false);

	let settings = $state<LevelsProcessingState>(createDefaultLevelsState());

	let histograms = $state<Record<string, Uint32Array>>({
		master: new Uint32Array(256),
		r: new Uint32Array(256),
		g: new Uint32Array(256),
		b: new Uint32Array(256),
		a: new Uint32Array(256)
	});

	let histogramCanvas = $state<HTMLCanvasElement | null>(null);

	// Draggable state
	let dialogPos = $state({ x: 100, y: 100 });
	let isDragging = false;
	let dragStart = { x: 0, y: 0 };

	$effect(() => {
		if (open && document) {
			const h = calculateHistogram(document.getImageRGBA().data);
			histograms = h;
		}
	});

	function drawChannel(
		ctx: CanvasRenderingContext2D,
		h: Uint32Array,
		color: string,
		width: number,
		height: number,
		scale: number
	) {
		ctx.fillStyle = color;
		for (let i = 0; i < 256; i++) {
			const val = h[i];
			if (val === 0) continue;
			const h_val = !isLogarithmic ? val : Math.log(val + 1);
			const x = (i / 255) * width;
			const barHeight = (h_val / scale) * height;
			ctx.fillRect(x, height - barHeight, width / 256 + 1, barHeight);
		}
	}

	function drawHistogram() {
		if (!histogramCanvas) return;
		const ctx = histogramCanvas.getContext('2d');
		if (!ctx) return;

		const width = histogramCanvas.width;
		const height = histogramCanvas.height;

		ctx.clearRect(0, 0, width, height);

		let max = 0;
		if (selectedChannel === 'master') {
			// Find overall max across R, G, B for scaling
			for (let i = 0; i < 256; i++) {
				max = Math.max(max, histograms.r[i], histograms.g[i], histograms.b[i]);
			}
		} else {
			const h = histograms[selectedChannel];
			for (let i = 0; i < 256; i++) {
				max = Math.max(max, h[i]);
			}
		}

		if (max === 0) return;
		const scale = !isLogarithmic ? max : Math.log(max + 1);

		if (selectedChannel === 'master') {
			ctx.globalCompositeOperation = 'screen';
			drawChannel(ctx, histograms.r, '#ff0000', width, height, scale);
			drawChannel(ctx, histograms.g, '#00ff00', width, height, scale);
			drawChannel(ctx, histograms.b, '#0000ff', width, height, scale);
			ctx.globalCompositeOperation = 'source-over';
		} else {
			const color =
				selectedChannel === 'r'
					? '#ef4444'
					: selectedChannel === 'g'
						? '#22c55e'
						: selectedChannel === 'b'
							? '#3b82f6'
							: selectedChannel === 'a'
								? '#94a3b8'
								: '#ffffff';
			drawChannel(ctx, histograms[selectedChannel], color, width, height, scale);
		}
	}

	$effect(() => {
		if (open && histograms[selectedChannel]) {
			drawHistogram();
		}
	});

	const currentLUTs = $derived.by(() => {
		return calculateCombinedLUTs(settings);
	});

	$effect(() => {
		if (open && canvasManager) {
			if (previewEnabled) {
				canvasManager.setFilters(currentLUTs);
			} else {
				canvasManager.setFilters(null);
			}
		}
	});

	function handleReset() {
		settings = createDefaultLevelsState();
	}

	function handleCancel() {
		if (canvasManager) canvasManager.setFilters(null);
		handleReset();
		open = false;
		onClose();
	}

	function handleApply() {
		if (document) {
			document.applyFilters(currentLUTs);
		}
		if (canvasManager) {
			canvasManager.setFilters(null);
			canvasManager.updateRender();
		}
		handleReset();
		open = false;
		onApply();
	}

	let sliderTrack = $state<HTMLElement | null>(null);
	let activeMarker = $state<'black' | 'white' | 'gamma' | null>(null);

	function getGammaPos(gamma: number): number {
		return Math.pow(0.5, gamma);
	}

	function getGammaFromPos(pos: number): number {
		const p = Math.max(0.01, Math.min(0.99, pos));
		return Math.log(p) / Math.log(0.5);
	}

	const chState = $derived(selectedChannel as keyof LevelsProcessingState);
	const bPos = $derived((settings[chState].black / 255) * 100);
	const wPos = $derived((settings[chState].white / 255) * 100);
	const gRel = $derived(getGammaPos(settings[chState].gamma));
	const gPos = $derived(bPos + (wPos - bPos) * gRel);

	function handleSliderMouseDown(e: MouseEvent, marker: 'black' | 'white' | 'gamma') {
		e.stopPropagation();
		activeMarker = marker;
	}

	function handleSliderMouseMove(e: MouseEvent) {
		if (!activeMarker || !sliderTrack) return;

		const rect = sliderTrack.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const val = Math.round(x * 255);
		const ch = selectedChannel as keyof LevelsProcessingState;

		if (activeMarker === 'black') {
			settings[ch].black = Math.min(val, settings[ch].white - 1);
		} else if (activeMarker === 'white') {
			settings[ch].white = Math.max(val, settings[ch].black + 1);
		} else if (activeMarker === 'gamma') {
			const range = settings[ch].white - settings[ch].black;
			if (range > 0) {
				const relativePos = (val - settings[ch].black) / range;
				settings[ch].gamma = getGammaFromPos(relativePos);
			}
		}
	}

	function handleGlobalMouseUp() {
		activeMarker = null;
		isDragging = false;
	}

	function onMouseDown(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('.drag-handle')) {
			isDragging = true;
			dragStart = { x: e.clientX - dialogPos.x, y: e.clientY - dialogPos.y };
		}
	}

	function onMouseMove(e: MouseEvent) {
		if (isDragging) {
			dialogPos = {
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y
			};
		}
		if (activeMarker) {
			handleSliderMouseMove(e);
		}
	}
</script>

<svelte:window onmousemove={onMouseMove} onmouseup={handleGlobalMouseUp} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-[100] flex w-[480px] flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#252526] text-gray-300 shadow-2xl"
		style="left: {dialogPos.x}px; top: {dialogPos.y}px;"
		onmousedown={onMouseDown}
	>
		<div
			class="drag-handle flex cursor-move items-center justify-between border-b border-gray-700 bg-[#333333] p-3 select-none"
		>
			<h3 class="text-sm font-bold tracking-wider text-gray-200 uppercase">Уровни</h3>
			<button onclick={handleCancel} class="text-gray-400 transition-colors hover:text-white">
				<CloseOutline class="h-5 w-5" />
			</button>
		</div>

		<div class="space-y-4 p-4">
			<div class="flex items-center gap-4">
				<Label class="w-24 text-xs font-bold text-gray-500 uppercase">Канал:</Label>
				<Select
					items={channels}
					bind:value={selectedChannel}
					class="border-gray-700 bg-gray-800 text-sm text-white"
				/>
			</div>

			<div class="rounded border border-gray-800 bg-gray-950 px-6 py-4 shadow-inner">
				<canvas bind:this={histogramCanvas} width="400" height="120" class="h-32 w-full"></canvas>

				<div class="relative mt-2 h-10 select-none">
					<div
						class="h-3 w-full rounded-sm border border-gray-800"
						style="background: linear-gradient(to right, black, white);"
					></div>

					<div bind:this={sliderTrack} class="absolute top-3 right-0 left-0 h-7">
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute top-0 -ml-2 h-4 w-4 cursor-pointer text-black transition-transform hover:scale-110"
							style="left: {bPos}%;"
							onmousedown={(e) => handleSliderMouseDown(e, 'black')}
						>
							<svg viewBox="0 0 20 20" fill="currentColor">
								<path d="M10 0 L20 15 L0 15 Z" stroke="white" stroke-width="1" />
							</svg>
						</div>

						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute top-0 -ml-2 h-4 w-4 cursor-pointer text-white transition-transform hover:scale-110"
							style="left: {wPos}%;"
							onmousedown={(e) => handleSliderMouseDown(e, 'white')}
						>
							<svg viewBox="0 0 20 20" fill="currentColor">
								<path d="M10 0 L20 15 L0 15 Z" stroke="black" stroke-width="1" />
							</svg>
						</div>

						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute top-0 -ml-2 h-4 w-4 cursor-pointer text-gray-400 transition-transform hover:scale-110"
							style="left: {gPos}%;"
							onmousedown={(e) => handleSliderMouseDown(e, 'gamma')}
						>
							<svg viewBox="0 0 20 20" fill="currentColor">
								<path d="M10 0 L20 15 L0 15 Z" stroke="black" stroke-width="1" />
							</svg>
						</div>
					</div>
				</div>

				<div class="relative mt-2 h-5 font-mono text-[11px] font-bold text-gray-400">
					<span class="absolute -translate-x-1/2" style="left: {bPos}%"
						>{settings[chState].black}</span
					>
					<span class="absolute -translate-x-1/2" style="left: {gPos}%"
						>{settings[chState].gamma.toFixed(2)}</span
					>
					<span class="absolute -translate-x-1/2" style="left: {wPos}%"
						>{settings[chState].white}</span
					>
				</div>
			</div>

			<div class="flex flex-col items-start gap-2 pt-2">
				<Checkbox bind:checked={previewEnabled} class="text-sm">Предпросмотр</Checkbox>
				<Checkbox bind:checked={isLogarithmic} class="text-sm">Логарифмическая шкала</Checkbox>
			</div>

			<div class="flex justify-between border-t border-gray-800 pt-4">
				<Button
					color="alternative"
					onclick={handleReset}
					class="border-gray-700 bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
					>Сброс</Button
				>
				<div class="flex gap-2">
					<Button
						color="alternative"
						onclick={handleCancel}
						class="border-gray-700 bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
						>Отмена</Button
					>
					<Button color="primary" onclick={handleApply} class="px-6 py-2 text-xs">Применить</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@reference "../../routes/layout.css";

	:global(.levels-range) {
		@apply h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-gray-800;
	}
	:global(.levels-range::-webkit-slider-thumb) {
		@apply h-4 w-4 appearance-none rounded-full border-2 border-gray-900 bg-primary-500 shadow-lg;
	}
	:global(.levels-range::-moz-range-thumb) {
		@apply h-4 w-4 appearance-none rounded-full border-2 border-gray-900 bg-primary-500 shadow-lg;
	}
</style>
