import { ImageDocument } from '../image';
import { ImageTransformer, type InterpolationMethod } from '../image/transform';

export type Channel = 'r' | 'g' | 'b' | 'a' | 'gray';

export interface ViewportRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export class CanvasManager {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;

	private document: ImageDocument | null = null;
	private zoom: number = 1.0;
	private interpolationMethod: InterpolationMethod = 'bilinear';
	private viewport: ViewportRect | null = null;

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

	public setViewport(rect: ViewportRect): void {
		this.viewport = rect;
		this.updateRender();
	}

	public loadDocument(doc: ImageDocument): void {
		this.document = doc;
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

	private previewImageData: ImageData | null = null;
	public setPreviewImageData(data: ImageData | null): void {
		this.previewImageData = data;
		this.updateRender();
	}

	public updateRender(): void {
		if (!this.document) return;

		const meta = this.document.meta;
		const fullTargetWidth = Math.max(1, Math.round(meta.width * this.zoom));
		const fullTargetHeight = Math.max(1, Math.round(meta.height * this.zoom));

		if (this.canvas.width !== fullTargetWidth || this.canvas.height !== fullTargetHeight) {
			this.canvas.width = fullTargetWidth;
			this.canvas.height = fullTargetHeight;
		}

		const v = this.viewport || { x: 0, y: 0, width: fullTargetWidth, height: fullTargetHeight };
		const buffer = 2; 
		const renderX = Math.max(0, Math.floor(v.x) - buffer);
		const renderY = Math.max(0, Math.floor(v.y) - buffer);
		const renderWidth = Math.min(fullTargetWidth - renderX, Math.ceil(v.width) + buffer * 2);
		const renderHeight = Math.min(fullTargetHeight - renderY, Math.ceil(v.height) + buffer * 2);

		if (renderWidth <= 0 || renderHeight <= 0) return;

		let sourceData: Uint8ClampedArray;
		let sourceWidth: number;
		let sourceHeight: number;

		if (this.previewImageData) {
			sourceData = this.previewImageData.data;
			sourceWidth = this.previewImageData.width;
			sourceHeight = this.previewImageData.height;
		} else {
			sourceData = this.document.getImageRGBA().data;
			sourceWidth = meta.width;
			sourceHeight = meta.height;
		}

		const xRatio = (sourceWidth - 1) / (fullTargetWidth - 1 || 1);
		const yRatio = (sourceHeight - 1) / (fullTargetHeight - 1 || 1);

		const srcX1 = Math.floor(renderX * xRatio);
		const srcY1 = Math.floor(renderY * yRatio);
		const srcX2 = Math.min(sourceWidth - 1, Math.ceil((renderX + renderWidth) * xRatio) + 1);
		const srcY2 = Math.min(sourceHeight - 1, Math.ceil((renderY + renderHeight) * yRatio) + 1);

		const srcRegionWidth = (srcX2 - srcX1) + 1;
		const srcRegionHeight = (srcY2 - srcY1) + 1;

		if (srcRegionWidth <= 0 || srcRegionHeight <= 0) return;

		const processedData = new ImageData(srcRegionWidth, srcRegionHeight);
		const dst = processedData.data;

		const isOnlyAlpha =
			this.activeChannels.a &&
			!this.activeChannels.r &&
			!this.activeChannels.g &&
			!this.activeChannels.b;

		for (let y = 0; y < srcRegionHeight; y++) {
			const sy = srcY1 + y;
			const srcRowOffset = sy * sourceWidth;
			const dstRowOffset = y * srcRegionWidth;

			for (let x = 0; x < srcRegionWidth; x++) {
				const sx = srcX1 + x;
				const srcIdx = (srcRowOffset + sx) * 4;
				const dstIdx = (dstRowOffset + x) * 4;

				let r = sourceData[srcIdx];
				let g = sourceData[srcIdx + 1];
				let b = sourceData[srcIdx + 2];
				let a = sourceData[srcIdx + 3];

				if (this.filterLUTs && !this.previewImageData) {
					r = this.filterLUTs.r[r];
					g = this.filterLUTs.g[g];
					b = this.filterLUTs.b[b];
					a = this.filterLUTs.a[a];
				}

				if (isOnlyAlpha) {
					dst[dstIdx] = a;
					dst[dstIdx + 1] = a;
					dst[dstIdx + 2] = a;
					dst[dstIdx + 3] = 255;
					continue;
				}

				dst[dstIdx] = this.activeChannels.r ? r : 0;
				dst[dstIdx + 1] = this.activeChannels.g ? g : 0;
				dst[dstIdx + 2] = this.activeChannels.b ? b : 0;
				dst[dstIdx + 3] = this.activeChannels.a ? a : 255;
			}
		}

		const scaledData = ImageTransformer.resizeRegion({
			method: this.interpolationMethod,
			source: processedData,
			sourceOffsetX: srcX1,
			sourceOffsetY: srcY1,
			fullSourceWidth: sourceWidth,
			fullSourceHeight: sourceHeight,
			targetX: renderX,
			targetY: renderY,
			targetWidth: renderWidth,
			targetHeight: renderHeight,
			fullTargetWidth: fullTargetWidth,
			fullTargetHeight: fullTargetHeight
		});

		this.ctx.putImageData(scaledData, renderX, renderY);
	}

	public getCoordinatesFromMouseEvent(e: MouseEvent): { x: number; y: number } | null {
		if (!this.document) return null;
		const rect = this.canvas.getBoundingClientRect();
		const x = Math.floor((e.clientX - rect.left) * (this.document.meta.width / rect.width));
		const y = Math.floor((e.clientY - rect.top) * (this.document.meta.height / rect.height));

		if (x < 0 || y < 0 || x >= this.document.meta.width || y >= this.document.meta.height) {
			return null;
		}
		return { x, y };
	}
}
