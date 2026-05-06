<script lang="ts">
	import { tick } from 'svelte';
	import {
		Modal,
		Button,
		Input,
		Dropdown,
		DropdownItem,
		DropdownDivider,
		Label
	} from 'flowbite-svelte';
	import {
		EyeSolid,
		EyeSlashSolid,
		ChevronDownOutline,
		ChevronRightOutline,
		ChevronLeftOutline,
		PaletteOutline
	} from 'flowbite-svelte-icons';

	import { ImageDocument, type RGBA, type LAB } from '$lib/modules/image';
	import { CanvasManager, type Channel } from '$lib/modules/canvas';
	import { Codec } from '$lib/modules/image/codec';


	let document = $state<ImageDocument | null>(null);
	let docVersion = $state(0);
	let canvasManager = $state<CanvasManager | null>(null);
	let mainCanvas = $state<HTMLCanvasElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	type Tool = 'mouse' | 'pipette';
	let activeTool = $state<Tool>('mouse');

	let isRightPanelOpen = $state(true);
	let pipetteData = $state<{ x: number; y: number; rgba: RGBA; lab: LAB } | null>(null);

	let isInfoOpen = $state(true);

	let exportModalOpen = $state(false);
	let exportFormat = $state<'png' | 'jpg' | 'gb7'>('png');
	let exportFileName = $state('image');

	let activeChannels = $state<Record<Channel, boolean>>({
		r: true,
		g: true,
		b: true,
		a: true,
		gray: true
	});

	let docInfo = $derived.by(() => {
		// Link to docVersion to force re-calculation
		if (docVersion < 0) return { channels: [] as Channel[], depth: '' };
		if (!document) return { channels: [] as Channel[], depth: '0-bit (Пусто)' };

		const meta = document.meta;
		let channels: Channel[] = [];
		if (meta.channels === 'Grayscale') channels = ['gray'];
		else if (meta.channels === 'Grayscale + Alpha') channels = ['gray', 'a'];
		else if (meta.channels === 'RGB') channels = ['r', 'g', 'b'];
		else if (meta.channels === 'RGBA') channels = ['r', 'g', 'b', 'a'];

		const active = channels.filter((ch) => activeChannels[ch]);
		const count = active.length;

		let depth;
		if (meta.channels.includes('Grayscale')) {
			if (count === 2) depth = '16-bit Grayscale + Alpha';
			else if (count === 1) depth = active[0] === 'gray' ? '8-bit Grayscale' : '8-bit Alpha';
			else depth = '0-bit (Пусто)';
		} else {
			if (count === 4) depth = '32-bit RGBA';
			else if (count === 3) depth = '24-bit RGB';
			else if (count === 2) depth = `16-bit (${count} канала)`;
			else if (count === 1) depth = `8-bit (${count} канал)`;
			else depth = '0-bit (Пусто)';
		}

		return { channels, depth };
	});

	let dragCounter = $state(0);
	let isDraggingOver = $derived(dragCounter > 0);

	async function loadFile(file: File) {
		try {
			const newDoc = await ImageDocument.createFromFile(file);
			document = newDoc;
			exportFileName = file.name.split('.').slice(0, -1).join('.') || 'image';

			activeChannels = { r: true, g: true, b: true, a: true, gray: true };
			pipetteData = null;

			// kaboom?
			canvasManager = null;

			// will error if we dont
			await tick();

			if (mainCanvas) {
				// force redraw
				canvasManager = new CanvasManager(mainCanvas);
				canvasManager.loadDocument(document);
			}
		} catch (error) {
			alert('Ошибка загрузки файла: ' + (error instanceof Error ? error.message : String(error)));
		}
	}

	function handleFileInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files?.[0]) loadFile(target.files[0]);
		target.value = '';
	}

	function onWindowDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCounter++;
	}
	function onWindowDragLeave(e: DragEvent) {
		e.preventDefault();
		dragCounter--;
	}
	function onWindowDragOver(e: DragEvent) {
		e.preventDefault();
	}
	function onWindowDrop(e: DragEvent) {
		e.preventDefault();
		dragCounter = 0;
		const file = e.dataTransfer?.files?.[0];
		if (file) loadFile(file);
	}

	const drawPreview = (node: HTMLCanvasElement, channel: Channel) => {
		$effect(() => {
			if (docVersion < 0) return;
			if (canvasManager && document) {
				// reactive bait
				const meta = document.meta;
				const preview = canvasManager.generateChannelPreview(channel);
				if (preview) {
					node.width = meta.width;
					node.height = meta.height;
					node.getContext('2d')!.putImageData(preview, 0, 0);
				}
			}
		});
	};

	function toggleChannel(channel: Channel) {
		if (!canvasManager) return;
		activeChannels[channel] = !activeChannels[channel];

		if (channel === 'gray') {
			canvasManager.toggleChannel('r', activeChannels.gray);
			canvasManager.toggleChannel('g', activeChannels.gray);
			canvasManager.toggleChannel('b', activeChannels.gray);
		} else {
			canvasManager.toggleChannel(channel, activeChannels[channel]);
		}
	}

	function onCanvasClick(e: MouseEvent) {
		if (activeTool !== 'pipette' || !canvasManager || !document) return;

		const coords = canvasManager.getCoordinatesFromMouseEvent(e);
		if (!coords) return;

		const rgba = document.getPixelRGBA(coords.x, coords.y);
		const lab = document.getPixelLAB(coords.x, coords.y);

		if (rgba && lab) {
			pipetteData = { x: coords.x, y: coords.y, rgba, lab };
			isRightPanelOpen = true;
		}
	}

	function openExportDialog(format: 'png' | 'jpg' | 'gb7') {
		exportFormat = format;
		exportModalOpen = true;
	}

	async function confirmExport() {
		if (!document) return;

		let codec;
		if (exportFormat === 'gb7') codec = Codec.GB7;
		else if (exportFormat === 'png') codec = Codec.PNG;
		else if (exportFormat === 'jpg') codec = Codec.JPG;

		try {
			const blob = await document.export(codec!);
			const url = URL.createObjectURL(blob);
			const a = window.document.createElement('a');
			a.href = url;
			a.download = `${exportFileName}.${exportFormat}`;
			a.click();
			URL.revokeObjectURL(url);
			exportModalOpen = false;
		} catch (err) {
			alert('Ошибка экспорта: ' + (err instanceof Error ? err.message : String(err)));
		}
	}
</script>

<svelte:window
	ondragenter={onWindowDragEnter}
	ondragleave={onWindowDragLeave}
	ondragover={onWindowDragOver}
	ondrop={onWindowDrop}
/>

<input
	type="file"
	bind:this={fileInput}
	onchange={handleFileInputChange}
	class="hidden"
	accept=".png,.jpg,.jpeg,.gb7"
/>

{#if isDraggingOver}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm transition-opacity"
	>
		<div
			class="pointer-events-none w-full max-w-2xl rounded-2xl border-2 border-dashed border-primary-500 bg-gray-800 p-12 text-center shadow-2xl"
		>
			<svg
				aria-hidden="true"
				class="mx-auto mb-4 h-16 w-16 animate-pulse text-primary-500"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
				/>
			</svg>
			<h3 class="mb-2 text-3xl font-bold text-white">Отпустите файл</h3>
			<p class="text-gray-400">Изображение будет открыто в рабочем пространстве</p>
		</div>
	</div>
{/if}

<div class="flex h-screen flex-col overflow-hidden dark bg-[#1e1e1e] font-sans text-gray-300">
	<!-- МЕНЮ (ФАЙЛ) -->
	<header
		class="relative z-40 flex h-8 shrink-0 items-center border-b border-gray-800 bg-gray-900 px-2 text-sm select-none"
	>
		<button
			id="file-menu"
			class="rounded px-3 py-1 text-gray-300 transition-colors hover:bg-gray-700">Файл</button
		>
		<Dropdown
			triggeredBy="#file-menu"
			class="w-48 rounded border border-gray-700 bg-gray-800 shadow-xl"
			simple
		>
			<DropdownItem class="text-gray-300 hover:bg-gray-700" onclick={() => fileInput?.click()}
				>Открыть...</DropdownItem
			>
			<DropdownDivider />
			<DropdownItem
				id="save-as-menu"
				class="flex items-center justify-between text-gray-300 hover:bg-gray-700"
				disabled={!document}
			>
				Сохранить как <ChevronRightOutline class="h-4 w-4" />
			</DropdownItem>

			{#if document}
				<Dropdown
					triggeredBy="#save-as-menu"
					placement="right-start"
					class="w-32 border border-gray-700 bg-gray-800"
					simple
				>
					<DropdownItem
						class="text-gray-300 hover:bg-primary-600 hover:text-white"
						onclick={() => openExportDialog('png')}>PNG</DropdownItem
					>
					<DropdownDivider />
					<DropdownItem
						class="text-gray-300 hover:bg-primary-600 hover:text-white"
						onclick={() => openExportDialog('jpg')}>JPG</DropdownItem
					>
					<DropdownDivider />
					<DropdownItem
						class="text-gray-300 hover:bg-primary-600 hover:text-white"
						onclick={() => openExportDialog('gb7')}>GB7</DropdownItem
					>
				</Dropdown>
			{/if}
		</Dropdown>
	</header>

	<div
		class="relative z-30 flex h-10 shrink-0 items-center gap-2 border-b border-gray-800 bg-[#252526] px-2 shadow-sm"
	>
		<button
			class="rounded p-1.5 transition-colors {activeTool === 'mouse'
				? 'bg-gray-700 text-white shadow-inner'
				: 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}"
			onclick={() => (activeTool = 'mouse')}
			title="Указатель (Мышь)"
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"
				/></svg
			>
		</button>
		<button
			class="rounded p-1.5 transition-colors {activeTool === 'pipette'
				? 'bg-gray-700 text-white shadow-inner'
				: 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}"
			onclick={() => (activeTool = 'pipette')}
			title="Пипетка (Цвет пикселя)"
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M14.386 14.386l4.088 4.088a2.121 2.121 0 01-3 3l-1.54-1.54M10 10l-6.5 6.5a1.5 1.5 0 002.12 2.12L12 12m4.18-4.18l-3.36 3.36m-1.18-5.18l3.36 3.36m4.84-4.84a3 3 0 00-4.24 0l-1.06 1.06 4.24 4.24 1.06-1.06a3 3 0 000-4.24z"
				/></svg
			>
		</button>
	</div>

	<!-- РАБОЧАЯ ОБЛАСТЬ -->
	<main class="flex flex-1 overflow-hidden">
		{#if !document}
			<div class="flex flex-1 flex-col items-center justify-center bg-[#1e1e1e] p-8">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-700 bg-gray-900/50 p-16 transition-colors hover:border-gray-500 hover:bg-gray-800"
					onclick={() => fileInput?.click()}
				>
					<svg
						aria-hidden="true"
						class="mb-4 h-12 w-12 text-gray-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
						/></svg
					>
					<h3 class="mb-2 text-xl font-medium text-gray-300">Кликните или перетащите файл</h3>
					<p class="text-sm text-gray-500">Поддерживаются форматы: PNG, JPG, GB7</p>
				</div>
			</div>
		{:else}
			<!-- ЛЕВАЯ ПАНЕЛЬ -->
			<aside
				class="z-10 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-800 bg-[#252526] shadow-lg"
			>
				<div class="border-b border-gray-800">
					<button
						class="flex w-full items-center justify-between px-4 py-3 text-xs font-bold text-gray-400 uppercase hover:bg-gray-800/50 hover:text-white"
						onclick={() => (isInfoOpen = !isInfoOpen)}
					>
						<span>Свойства документа</span>
						<ChevronDownOutline
							class="h-4 w-4 transition-transform duration-200 {isInfoOpen ? 'rotate-180' : ''}"
						/>
					</button>
					{#if isInfoOpen}
						<div class="space-y-2 px-4 pb-4 text-sm text-gray-300">
							<div class="flex justify-between border-b border-gray-800/50 pb-1">
								<span class="text-gray-500">Разрешение</span><span class="font-mono"
									>{document.meta.width} × {document.meta.height}</span
								>
							</div>
							<div class="flex justify-between border-b border-gray-800/50 pb-1">
								<span class="text-gray-500">Формат</span><span
									>{document.meta.format} ({document.meta.colorDepth})</span
								>
							</div>
							<div class="flex justify-between border-b border-gray-800/50 pb-1">
								<span class="text-gray-500">Каналы</span><span>{document.meta.channels}</span>
							</div>
							<div class="flex justify-between pb-1">
								<span class="text-gray-500">Холст</span><span class="text-primary-400"
									>{docInfo.depth}</span
								>
							</div>
						</div>
					{/if}
				</div>
				<div class="flex-1 p-4">
					<div class="mb-3 text-xs font-bold text-gray-400 uppercase">Каналы</div>
					<div class="space-y-2">
						{#each docInfo.channels as ch (ch)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="flex cursor-pointer items-center gap-3 rounded border p-2 transition-all {activeChannels[
									ch
								]
									? 'border-gray-600 bg-gray-800 shadow-sm'
									: 'border-transparent bg-transparent opacity-40 hover:bg-gray-800/50 hover:opacity-100'}"
								onclick={() => toggleChannel(ch)}
							>
								<button class="shrink-0 text-gray-400 hover:text-white">
									{#if activeChannels[ch]}<EyeSolid class="h-4 w-4" />{:else}<EyeSlashSolid
											class="h-4 w-4"
										/>{/if}
								</button>
								<div
									class="w-10 text-center font-mono text-[10px] font-bold text-gray-200 uppercase"
								>
									{ch === 'gray' ? 'Gray' : ch}
								</div>
								<div
									class="flex h-10 flex-1 items-center justify-center overflow-hidden rounded border border-gray-900 bg-black shadow-inner"
								>
									<canvas use:drawPreview={ch} class="h-full w-full object-contain"></canvas>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</aside>

			<section
				class="relative flex flex-1 items-center justify-center overflow-hidden p-8"
				id="workspace-bg"
			>
				<canvas
					bind:this={mainCanvas}
					onclick={onCanvasClick}
					class="max-h-full max-w-full shadow-2xl ring-1 ring-gray-800 transition-transform {activeTool ===
					'pipette'
						? 'cursor-crosshair'
						: 'cursor-default'}"
					style="object-fit: contain; background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 20px 20px;"
				></canvas>
			</section>

			<aside
				class="z-10 flex shrink-0 flex-col overflow-hidden border-l border-gray-800 bg-[#252526] shadow-xl transition-[width] duration-300 ease-in-out {isRightPanelOpen
					? 'w-72'
					: 'w-10'}"
			>
				<div
					class="flex h-10 shrink-0 items-center border-b border-gray-800 bg-[#2d2d2d] {isRightPanelOpen
						? 'justify-between px-3'
						: 'justify-center'}"
				>
					{#if isRightPanelOpen}
						<span
							class="flex items-center gap-2 text-xs font-bold tracking-wider text-gray-200 uppercase"
						>
							<PaletteOutline class="h-4 w-4" /> Инспектор цвета
						</span>
					{/if}
					<button
						class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
						onclick={() => (isRightPanelOpen = !isRightPanelOpen)}
					>
						{#if isRightPanelOpen}
							<ChevronRightOutline class="h-5 w-5" />
						{:else}
							<ChevronLeftOutline class="h-5 w-5" />
						{/if}
					</button>
				</div>

				<div class="relative w-72 flex-1">
					<div class="absolute inset-0 space-y-6 overflow-y-auto p-4">
						<!-- a nice way to set default values -->
						{#snippet inspector()}
							{@const x = pipetteData?.x ?? '-'}
							{@const y = pipetteData?.y ?? '-'}
							{@const r = pipetteData?.rgba.r ?? '-'}
							{@const g = pipetteData?.rgba.g ?? '-'}
							{@const b = pipetteData?.rgba.b ?? '-'}
							{@const a = pipetteData?.rgba.a ?? '-'}
							{@const l = pipetteData ? Math.round(pipetteData.lab.l) : '-'}
							{@const labA = pipetteData ? Math.round(pipetteData.lab.a) : '-'}
							{@const labB = pipetteData ? Math.round(pipetteData.lab.b) : '-'}
							{@const colorStr = pipetteData
								? `rgba(${pipetteData.rgba.r}, ${pipetteData.rgba.g}, ${pipetteData.rgba.b}, ${pipetteData.rgba.a / 255})`
								: 'rgba(0,0,0,1)'}

							<div class="flex items-center gap-4">
								<div
									class="h-16 w-16 rounded border border-gray-900 shadow-inner transition-colors duration-200"
									style="background-color: {colorStr};"
								></div>
								<div class="flex flex-col">
									<span class="mb-1 text-xs font-bold text-gray-500 uppercase">Координаты</span>
									<span class="font-mono text-gray-200">X: {x}</span>
									<span class="font-mono text-gray-200">Y: {y}</span>
								</div>
							</div>

							<div>
								<div class="mb-2 text-xs font-bold text-gray-500 uppercase">RGB / Alpha</div>
								<div class="grid grid-cols-2 gap-2 font-mono text-sm">
									<div
										class="rounded bg-gray-900 px-3 py-2 {pipetteData
											? 'border border-red-900/30 text-red-400'
											: 'border border-gray-800 text-gray-600'}"
									>
										R: {r}
									</div>
									<div
										class="rounded bg-gray-900 px-3 py-2 {pipetteData
											? 'border border-green-900/30 text-green-400'
											: 'border border-gray-800 text-gray-600'}"
									>
										G: {g}
									</div>
									<div
										class="rounded bg-gray-900 px-3 py-2 {pipetteData
											? 'border border-blue-900/30 text-blue-400'
											: 'border border-gray-800 text-gray-600'}"
									>
										B: {b}
									</div>
									<div
										class="rounded bg-gray-900 px-3 py-2 {pipetteData
											? 'border border-gray-700 text-gray-300'
											: 'border border-gray-800 text-gray-600'}"
									>
										A: {a}
									</div>
								</div>
							</div>

							<div>
								<div class="mb-2 text-xs font-bold text-gray-500 uppercase">CIELAB (D65, 2°)</div>
								<div class="space-y-2 font-mono text-sm">
									<div
										class="flex justify-between rounded border border-gray-800 bg-gray-900 px-3 py-2 text-gray-400"
									>
										<span>L* (Lightness)</span>
										<span class={pipetteData ? 'text-gray-200' : 'text-gray-600'}>{l}</span>
									</div>
									<div
										class="flex justify-between rounded border border-gray-800 bg-gray-900 px-3 py-2 text-gray-400"
									>
										<span>a* (Green-Red)</span>
										<span class={pipetteData ? 'text-gray-200' : 'text-gray-600'}>{labA}</span>
									</div>
									<div
										class="flex justify-between rounded border border-gray-800 bg-gray-900 px-3 py-2 text-gray-400"
									>
										<span>b* (Blue-Yellow)</span>
										<span class={pipetteData ? 'text-gray-200' : 'text-gray-600'}>{labB}</span>
									</div>
								</div>
							</div>
						{/snippet}
						{@render inspector()}
					</div>
				</div>
			</aside>
		{/if}
	</main>

	<Modal
		bind:open={exportModalOpen}
		size="xs"
		autoclose={false}
		class="w-full border border-gray-700 bg-[#252526] shadow-2xl"
	>
		<form
			class="flex flex-col space-y-6"
			onsubmit={(e) => {
				e.preventDefault();
				confirmExport();
			}}
		>
			<h3 class="mb-2 text-xl font-medium text-white">Параметры сохранения</h3>
			<div>
				<Label class="space-y-2 text-gray-300">
					<span>Имя файла</span>
					<Input
						type="text"
						bind:value={exportFileName}
						required
						class="border-gray-700 bg-gray-800 text-white focus:ring-primary-500"
					/>
				</Label>
			</div>
			<div class="rounded border border-gray-700 bg-gray-800 p-3 text-sm text-gray-400">
				<div class="mb-1 flex justify-between">
					<span>Формат:</span><span class="font-bold text-gray-200 uppercase">{exportFormat}</span>
				</div>
				<div class="flex justify-between">
					<span>Разрешение:</span><span>{document?.meta.width} × {document?.meta.height}</span>
				</div>
			</div>
			<div class="flex justify-end gap-3">
				<Button
					color="alternative"
					onclick={() => (exportModalOpen = false)}
					class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
					>Отмена</Button
				>
				<Button type="submit" color="primary">Сохранить</Button>
			</div>
		</form>
	</Modal>
</div>
