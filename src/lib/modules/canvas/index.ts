import { ImageDocument } from '../image';
import { ImageTransformer, type InterpolationMethod } from '../image/transform';

export type Channel = 'r' | 'g' | 'b' | 'a' | 'gray';

export class CanvasManager {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;

	private document: ImageDocument | null = null;
	private zoom: number = 1.0;
	private interpolationMethod: InterpolationMethod = 'bilinear';

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

	public setZoom(zoom: number): void {
		this.zoom = zoom;
		this.updateRender();
	}

	public getZoom(): number {
		return this.zoom;
	}

	public setInterpolationMethod(method: InterpolationMethod): void {
		this.interpolationMethod = method;
		this.updateRender();
	}

	public loadDocument(doc: ImageDocument): void {
		this.document = doc;
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
		if (!this.document) return;

		const originalData = this.document.getImageRGBA();
		const meta = this.document.meta;

		const processedData = new ImageData(meta.width, meta.height);
		const src = originalData.data;
		const dst = processedData.data;

		const isOnlyAlpha =
			this.activeChannels.a &&
			!this.activeChannels.r &&
			!this.activeChannels.g &&
			!this.activeChannels.b;

		for (let i = 0; i < src.length; i += 4) {
			let r = src[i];
			let g = src[i + 1];
			let b = src[i + 2];
			let a = src[i + 3];

			if (this.filterLUTs) {
				r = this.filterLUTs.r[r];
				g = this.filterLUTs.g[g];
				b = this.filterLUTs.b[b];
				a = this.filterLUTs.a[a];
			}

			if (isOnlyAlpha) {
				dst[i] = a;
				dst[i + 1] = a;
				dst[i + 2] = a;
				dst[i + 3] = 255;
				continue;
			}

			dst[i] = this.activeChannels.r ? r : 0;
			dst[i + 1] = this.activeChannels.g ? g : 0;
			dst[i + 2] = this.activeChannels.b ? b : 0;
			dst[i + 3] = this.activeChannels.a ? a : 255;
		}

		const targetWidth = Math.max(1, Math.round(meta.width * this.zoom));
		const targetHeight = Math.max(1, Math.round(meta.height * this.zoom));

		const scaledData = ImageTransformer.resize(processedData, {
			width: targetWidth,
			height: targetHeight,
			method: this.interpolationMethod
		});

		this.canvas.width = targetWidth;
		this.canvas.height = targetHeight;
		this.ctx.putImageData(scaledData, 0, 0);
	}

	public getCoordinatesFromMouseEvent(e: MouseEvent): { x: number; y: number } | null {
		if (!this.document) return null;

		const rect = this.canvas.getBoundingClientRect();
		
		// map viewport coordinates back to original image coordinates
		// rect.width / targetWidth is the ratio between CSS pixels and Canvas pixels
		// but targetWidth = meta.width * zoom
		// so total scale = (rect.width / (meta.width * zoom)) * zoom = rect.width / meta.width
		
		const x = Math.floor((e.clientX - rect.left) * (this.document.meta.width / rect.width));
		const y = Math.floor((e.clientY - rect.top) * (this.document.meta.height / rect.height));

		if (x < 0 || y < 0 || x >= this.document.meta.width || y >= this.document.meta.height) {
			return null;
		}

		return { x, y };
	}
}
