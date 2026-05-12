<script lang="ts">
	import {
		Button,
		Label,
		Input,
		Select,
		Checkbox,
		Tooltip,
		Helper
	} from 'flowbite-svelte';
	import { InfoCircleOutline, CloseOutline } from 'flowbite-svelte-icons';
	import type { ImageDocument } from '$lib/modules/image';
	import type { InterpolationMethod } from '$lib/modules/image/transform';

	interface Props {
		open: boolean;
		document: ImageDocument | null;
		onApply: (width: number, height: number, method: InterpolationMethod) => void;
		onClose: () => void;
	}

	let { open = $bindable(), document, onApply, onClose }: Props = $props();

	let unit = $state<'pixels' | 'percent'>('pixels');
	let width = $state(0);
	let height = $state(0);
	let lockAspectRatio = $state(true);
	let interpolation = $state<InterpolationMethod>('bilinear');

	let originalWidth = $derived(document?.meta.width ?? 0);
	let originalHeight = $derived(document?.meta.height ?? 0);
	let aspectRatio = $derived(originalWidth / originalHeight || 1);

	let prevUnit = $state<'pixels' | 'percent'>('pixels');
	$effect(() => {
		if (unit !== prevUnit) {
			if (unit === 'percent') {
				width = Number(((width / originalWidth) * 100).toFixed(2));
				height = Number(((height / originalHeight) * 100).toFixed(2));
			} else {
				width = Math.round((originalWidth * width) / 100);
				height = Math.round((originalHeight * height) / 100);
			}
			prevUnit = unit;
		}
	});

	$effect(() => {
		if (open && document) {
			width = originalWidth;
			height = originalHeight;
			unit = 'pixels';
			prevUnit = 'pixels';
		}
	});

	function handleWidthChange(val: number) {
		width = val;
		if (lockAspectRatio) {
			if (unit === 'pixels') {
				height = Math.round(width / aspectRatio);
			} else {
				height = width;
			}
		}
	}

	function handleHeightChange(val: number) {
		height = val;
		if (lockAspectRatio) {
			if (unit === 'pixels') {
				width = Math.round(height * aspectRatio);
			} else {
				width = height;
			}
		}
	}

	let targetWidthPx = $derived.by(() => {
		if (unit === 'pixels') return width;
		return Math.round((originalWidth * width) / 100);
	});

	let targetHeightPx = $derived.by(() => {
		if (unit === 'pixels') return height;
		return Math.round((originalHeight * height) / 100);
	});

	let megapixelsBefore = $derived(((originalWidth * originalHeight) / 1000000).toFixed(2));
	let megapixelsAfter = $derived(((targetWidthPx * targetHeightPx) / 1000000).toFixed(2));

	const interpolationOptions = [
		{ value: 'nearest', name: 'Ближайший сосед' },
		{ value: 'bilinear', name: 'Билинейная интерполяция' }
	];

	function validate() {
		if (targetWidthPx <= 0 || targetHeightPx <= 0) return false;
		if (targetWidthPx > 10000 || targetHeightPx > 10000) return false;
		return true;
	}

	function submit() {
		if (validate()) {
			onApply(targetWidthPx, targetHeightPx, interpolation);
			open = false;
		}
	}

	function handleCancel() {
		open = false;
		onClose();
	}
</script>

{#if open}
	<div
		class="fixed left-1/2 top-1/2 z-[100] flex w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#252526] text-gray-300 shadow-2xl"
	>
		<div
			class="flex items-center justify-between border-b border-gray-700 bg-[#333333] p-3 select-none"
		>
			<h3 class="text-sm font-bold tracking-wider text-gray-200 uppercase">Размер изображения</h3>
			<button onclick={handleCancel} class="text-gray-400 transition-colors hover:text-white">
				<CloseOutline class="h-5 w-5" />
			</button>
		</div>

		<div class="space-y-4 p-4">
			<div class="grid grid-cols-2 gap-4 rounded bg-gray-800 p-3 text-sm">
				<div>
					<div class="text-gray-500">До:</div>
					<div class="font-mono text-white">{originalWidth} × {originalHeight}</div>
					<div class="text-xs text-gray-400">{megapixelsBefore} Мп</div>
				</div>
				<div>
					<div class="text-gray-500">После:</div>
					<div class="font-mono text-primary-400">{targetWidthPx} × {targetHeightPx}</div>
					<div class="text-xs text-gray-400">{megapixelsAfter} Мп</div>
				</div>
			</div>

			<div>
				<Label class="mb-2 text-xs font-bold text-gray-500 uppercase">Единицы измерения</Label>
				<Select
					bind:value={unit}
					items={[
						{ value: 'pixels', name: 'Пиксели' },
						{ value: 'percent', name: 'Проценты' }
					]}
					class="border-gray-700 bg-gray-800 text-sm text-white"
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<Label class="mb-2 text-xs font-bold text-gray-500 uppercase">Ширина</Label>
					<Input
						type="number"
						value={width}
						oninput={(e) => handleWidthChange(Number((e.currentTarget as HTMLInputElement).value))}
						class="border-gray-700 bg-gray-800 text-sm text-white"
					/>
				</div>
				<div>
					<Label class="mb-2 text-xs font-bold text-gray-500 uppercase">Высота</Label>
					<Input
						type="number"
						value={height}
						oninput={(e) => handleHeightChange(Number((e.currentTarget as HTMLInputElement).value))}
						class="border-gray-700 bg-gray-800 text-sm text-white"
					/>
				</div>
			</div>

			<Checkbox bind:checked={lockAspectRatio} class="text-sm">
				Сохранять пропорции
			</Checkbox>

			<div>
				<Label class="mb-2 flex items-center gap-2 text-xs font-bold text-gray-500 uppercase">
					Интерполяция
					<InfoCircleOutline id="interp-info" class="h-4 w-4 cursor-help text-gray-500" />
					<Tooltip triggeredBy="#interp-info" class="max-w-xs bg-gray-700 text-xs">
						{#if interpolation === 'nearest'}
							<b>Метод ближайшего соседа:</b> Самый быстрый метод. Не создает новых цветов.
						{:else}
							<b>Билинейная интерполяция:</b> Усредняет значения четырех ближайших пикселей.
						{/if}
					</Tooltip>
				</Label>
				<Select
					bind:value={interpolation}
					items={interpolationOptions}
					class="border-gray-700 bg-gray-800 text-sm text-white"
				/>
			</div>

			{#if !validate()}
				<Helper color="red" class="text-xs"
					>Пожалуйста, введите корректные размеры (1-10000 пикселей).</Helper
				>
			{/if}

			<div class="flex w-full justify-end gap-3 pt-2">
				<Button
					color="alternative"
					onclick={handleCancel}
					class="border-gray-700 bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
					>Отмена</Button
				>
				<Button color="primary" onclick={submit} disabled={!validate()} class="px-6 py-2 text-xs"
					>Применить</Button
				>
			</div>
		</div>
	</div>
{/if}
