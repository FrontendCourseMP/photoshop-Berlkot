<script lang="ts">
	import {
		Button,
		Label,
		Input,
		Select,
		Checkbox,
		Helper
	} from 'flowbite-svelte';
	import { CloseOutline } from 'flowbite-svelte-icons';
	import type { ImageDocument } from '$lib/modules/image';
	import type { CanvasManager } from '$lib/modules/canvas';
	import { ImageFilters, PRESET_KERNELS, type EdgeHandling } from '$lib/modules/image/filters';
	import { tick } from 'svelte';

	interface Props {
		open: boolean;
		document: ImageDocument | null;
		canvasManager: CanvasManager | null;
		onApply: () => void;
		onClose: () => void;
	}

	let { open = $bindable(), document, canvasManager, onApply, onClose }: Props = $props();

	let selectedPreset = $state('identity');
	let kernel = $state<number[][]>([
		[0, 0, 0],
		[0, 1, 0],
		[0, 0, 0]
	]);
	
	let channels = $state({ r: true, g: true, b: true, a: false });
	let edgeHandling = $state<EdgeHandling>('copy');
	let previewEnabled = $state(true);
	let isProcessing = $state(false);

	let lastProcessedData: ImageData | null = null;
	let lastParamsStr = '';

	let dialogPos = $state({ x: 200, y: 150 });
	let isDragging = false;
	let dragStart = { x: 0, y: 0 };

	const presetOptions = [
		{ value: 'identity', name: 'Тождественное отображение' },
		{ value: 'sharpen', name: 'Повышение резкости' },
		{ value: 'gaussian', name: 'Фильтр Гаусса (3x3)' },
		{ value: 'boxBlur', name: 'Прямоугольное размытие' },
		{ value: 'prewittX', name: 'Оператор Прюитта (X)' },
		{ value: 'prewittY', name: 'Оператор Прюитта (Y)' },
		{ value: 'custom', name: 'Пользовательский' }
	];

	const edgeOptions = [
		{ value: 'black', name: 'Заполнение черным' },
		{ value: 'white', name: 'Заполнение белым' },
		{ value: 'copy', name: 'Копирование края' }
	];

	let abortController: AbortController | null = null;

	let lastOpen = false;
	$effect(() => {
		if (open && !lastOpen) {
			lastParamsStr = '';
		}
		if (!open && lastOpen) {
			handleReset();
		}
		lastOpen = open;
	});

	$effect(() => {
		if (selectedPreset !== 'custom') {
			kernel = JSON.parse(JSON.stringify(PRESET_KERNELS[selectedPreset]));
		}
	});

	$effect(() => {
		if (open && canvasManager && document) {
			if (lastParamsStr === '') {
				// already reset by handleReset, but let's be explicit
			}

			const _k = JSON.stringify(kernel);
			const _c = JSON.stringify(channels);
			const _e = edgeHandling;
			const _p = previewEnabled;

			if (previewEnabled) {
				updatePreview();
			} else {
				cancelCurrentTask();
				canvasManager.setPreviewImageData(null);
			}
		}
	});

	function cancelCurrentTask() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
	}

	async function updatePreview() {
		if (!document || !canvasManager || !previewEnabled) return;
		
		const currentParamsStr = JSON.stringify({ kernel, channels, edgeHandling });
		if (currentParamsStr === lastParamsStr) return;

		cancelCurrentTask();
		const controller = new AbortController();
		abortController = controller;
		
		await new Promise(r => setTimeout(r, 100));
		if (controller.signal.aborted) return;

		isProcessing = true;

		try {
			const sourceData = document.getImageRGBA();
			const resultData = await ImageFilters.applyConvolution(sourceData, {
				kernel,
				channels,
				edgeHandling,
				abortSignal: controller.signal
			});
			
			if (resultData && open && previewEnabled && !controller.signal.aborted) {
				lastProcessedData = resultData;
				lastParamsStr = currentParamsStr;
				canvasManager.setPreviewImageData(resultData);
			}
		} catch (err) {
			if ((err as any).name !== 'AbortError') {
				console.error('Preview error:', err);
			}
		} finally {
			if (!controller.signal.aborted) {
				isProcessing = false;
				if (abortController === controller) abortController = null;
			}
		}
	}

	async function handleApply() {
		if (!document || !canvasManager) return;
		
		const currentParamsStr = JSON.stringify({ kernel, channels, edgeHandling });
		
		let finalData = lastProcessedData;

		if (!finalData || currentParamsStr !== lastParamsStr) {
			cancelCurrentTask();
			isProcessing = true;
			try {
				const sourceData = document.getImageRGBA();
				finalData = await ImageFilters.applyConvolution(sourceData, {
					kernel,
					channels,
					edgeHandling
				});
			} catch (err) {
				alert('Ошибка применения фильтра: ' + err);
				isProcessing = false;
				return;
			}
		}
		
		if (finalData) {
			canvasManager.setPreviewImageData(null);
			document.setImageRGBA(finalData);
			await tick();
			canvasManager.loadDocument(document);
			onApply();
			open = false; 
		}
		isProcessing = false;
	}

	function handleReset() {
		cancelCurrentTask();
		selectedPreset = 'identity';
		channels = { r: true, g: true, b: true, a: false };
		edgeHandling = 'copy';
		lastProcessedData = null;
		lastParamsStr = '';
		canvasManager?.setPreviewImageData(null);
	}

	function handleCancel() {
		cancelCurrentTask();
		canvasManager?.setPreviewImageData(null);
		open = false;
		onClose();
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
	}

	function onMouseUp() {
		isDragging = false;
	}
</script>

<svelte:window onmousemove={onMouseMove} onmouseup={onMouseUp} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-[100] flex w-[450px] flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#252526] text-gray-300 shadow-2xl"
		style="left: {dialogPos.x}px; top: {dialogPos.y}px;"
		onmousedown={onMouseDown}
	>
		<div
			class="drag-handle flex cursor-move items-center justify-between border-b border-gray-700 bg-[#333333] p-3 select-none"
		>
			<h3 class="text-sm font-bold tracking-wider text-gray-200 uppercase">Фильтрация (Ядра)</h3>
			<button onclick={handleCancel} class="text-gray-400 transition-colors hover:text-white">
				<CloseOutline class="h-5 w-5" />
			</button>
		</div>

		<div class="space-y-4 p-4">
			<div>
				<Label class="mb-2 text-xs font-bold text-gray-500 uppercase">Пресет</Label>
				<Select
					bind:value={selectedPreset}
					items={presetOptions}
					class="border-gray-700 bg-gray-800 text-sm text-white"
				/>
			</div>

			<div class="grid grid-cols-3 gap-2 mx-auto w-48 bg-gray-800 p-2 rounded">
				{#each [0, 1, 2] as y}
					{#each [0, 1, 2] as x}
						<Input
							type="number"
							step="any"
							bind:value={kernel[y][x]}
							oninput={() => (selectedPreset = 'custom')}
							class="h-10 text-center border-gray-700 bg-gray-900 text-xs text-white p-1"
						/>
					{/each}
				{/each}
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label class="text-xs font-bold text-gray-500 uppercase">Каналы</Label>
					<div class="grid grid-cols-2 gap-1">
						<Checkbox bind:checked={channels.r} class="text-xs">Red</Checkbox>
						<Checkbox bind:checked={channels.g} class="text-xs">Green</Checkbox>
						<Checkbox bind:checked={channels.b} class="text-xs">Blue</Checkbox>
						<Checkbox bind:checked={channels.a} class="text-xs">Alpha</Checkbox>
					</div>
				</div>
				<div class="space-y-2">
					<Label class="text-xs font-bold text-gray-500 uppercase">Края</Label>
					<Select
						bind:value={edgeHandling}
						items={edgeOptions}
						class="border-gray-700 bg-gray-800 text-xs text-white"
					/>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<Checkbox bind:checked={previewEnabled} class="text-sm">Предпросмотр</Checkbox>
			</div>

			{#if isProcessing}
				<Helper color="blue" class="text-center animate-pulse">Обработка изображения...</Helper>
			{/if}

			<div class="flex w-full justify-between pt-2 border-t border-gray-700 mt-2">
				<Button
					color="alternative"
					onclick={handleReset}
					class="border-gray-700 bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
				>Сброс</Button>
				<div class="flex gap-2">
					<Button
						color="alternative"
						onclick={handleCancel}
						class="border-gray-700 bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
					>Отмена</Button>
					<Button 
						color="primary" 
						onclick={handleApply} 
						disabled={isProcessing}
						class="px-6 py-2 text-xs"
					>Применить</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
