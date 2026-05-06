import { ImageDocument } from '../image';

export type Channel = 'r' | 'g' | 'b' | 'a' | 'gray';

export class CanvasManager {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;

	private document: ImageDocument | null = null;
	private renderData: ImageData | null = null;

	private activeChannels: Record<Channel, boolean> = {
		r: true,
		g: true,
		b: true,
		a: true,
		gray: true
	};

	private filterLUTs: {
		r: Uint8ClampedArray;
		g: Uint8ClampedArray;
		b: Uint8ClampedArray;
		a: Uint8ClampedArray;
	} | null = null;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) throw new Error('Canvas 2D context is not supported');
		this.ctx = ctx;
	}

	public loadDocument(doc: ImageDocument): void {
		this.document = doc;
		this.canvas.width = doc.meta.width;
		this.canvas.height = doc.meta.height;

		this.renderData = new ImageData(doc.meta.width, doc.meta.height);

		this.activeChannels = { r: true, g: true, b: true, a: true, gray: true };
		this.updateRender();
	}

	public toggleChannel(channel: Channel, isActive: boolean): void {
		if (!this.document || this.activeChannels[channel] === isActive) return;
		this.activeChannels[channel] = isActive;
		this.updateRender();
	}

	public isChannelActive(channel: Channel): boolean {
		return this.activeChannels[channel];
	}

	public generateChannelPreview(channel: Channel): ImageData | null {
		if (!this.document) return null;

		const { width, height } = this.document.meta;
		const originalData = this.document.getImageRGBA().data;
		const preview = new ImageData(width, height);
		const dest = preview.data;

		for (let i = 0; i < originalData.length; i += 4) {
			let val = 0;
			if (channel === 'r') val = originalData[i];
			else if (channel === 'g') val = originalData[i + 1];
			else if (channel === 'b') val = originalData[i + 2];
			else if (channel === 'a') val = originalData[i + 3];
			else if (channel === 'gray') {
				// Rec. 601
				val = Math.round(
					0.299 * originalData[i] + 0.587 * originalData[i + 1] + 0.114 * originalData[i + 2]
				);
			}

			// display as grayscale
			dest[i] = val;
			dest[i + 1] = val;
			dest[i + 2] = val;
			dest[i + 3] = 255;
		}

		return preview;
	}

	public setFilters(
		luts: {
			r: Uint8ClampedArray;
			g: Uint8ClampedArray;
			b: Uint8ClampedArray;
			a: Uint8ClampedArray;
		} | null
	): void {
		this.filterLUTs = luts;
		this.updateRender();
	}

	public updateRender(): void {
		if (!this.document || !this.renderData) return;

		const originalData = this.document.getImageRGBA().data;
		const renderData = this.renderData.data;

		const isOnlyAlpha =
			this.activeChannels.a &&
			!this.activeChannels.r &&
			!this.activeChannels.g &&
			!this.activeChannels.b;

		for (let i = 0; i < originalData.length; i += 4) {
			let r = originalData[i];
			let g = originalData[i + 1];
			let b = originalData[i + 2];
			let a = originalData[i + 3];

			if (this.filterLUTs) {
				r = this.filterLUTs.r[r];
				g = this.filterLUTs.g[g];
				b = this.filterLUTs.b[b];
				a = this.filterLUTs.a[a];
			}

			if (isOnlyAlpha) {
				renderData[i] = a;
				renderData[i + 1] = a;
				renderData[i + 2] = a;
				renderData[i + 3] = 255;
				continue;
			}

			renderData[i] = this.activeChannels.r ? r : 0;
			renderData[i + 1] = this.activeChannels.g ? g : 0;
			renderData[i + 2] = this.activeChannels.b ? b : 0;

			renderData[i + 3] = this.activeChannels.a ? a : 255;
		}

		this.ctx.putImageData(this.renderData, 0, 0);
	}

	public getCoordinatesFromMouseEvent(e: MouseEvent): { x: number; y: number } | null {
		if (!this.document) return null;

		const rect = this.canvas.getBoundingClientRect();
		const scaleX = this.canvas.width / rect.width;
		const scaleY = this.canvas.height / rect.height;

		const x = Math.floor((e.clientX - rect.left) * scaleX);
		const y = Math.floor((e.clientY - rect.top) * scaleY);

		if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) {
			return null;
		}

		return { x, y };
	}
}
