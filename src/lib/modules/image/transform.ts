export type InterpolationMethod = 'nearest' | 'bilinear';

export interface ResizeOptions {
	width: number;
	height: number;
	method: InterpolationMethod;
}

export interface RegionResizeOptions {
	method: InterpolationMethod;
	source: ImageData;
	sourceOffsetX: number;
	sourceOffsetY: number;
	fullSourceWidth: number;
	fullSourceHeight: number;
	targetX: number;
	targetY: number;
	targetWidth: number;
	targetHeight: number;
	fullTargetWidth: number;
	fullTargetHeight: number;
}

export class ImageTransformer {
	public static resize(source: ImageData, options: ResizeOptions): ImageData {
		const { width, height, method } = options;
		return this.resizeRegion({
			method,
			source,
			sourceOffsetX: 0,
			sourceOffsetY: 0,
			fullSourceWidth: source.width,
			fullSourceHeight: source.height,
			targetX: 0,
			targetY: 0,
			targetWidth: width,
			targetHeight: height,
			fullTargetWidth: width,
			fullTargetHeight: height
		});
	}

	public static resizeRegion(options: RegionResizeOptions): ImageData {
		const { targetWidth, targetHeight, method } = options;
		const targetData = new ImageData(targetWidth, targetHeight);

		if (method === 'nearest') {
			this.nearestNeighborRegion(targetData, options);
		} else {
			this.bilinearRegion(targetData, options);
		}

		return targetData;
	}

	private static nearestNeighborRegion(target: ImageData, opt: RegionResizeOptions): void {
		const sw = opt.source.width;
		const sh = opt.source.height;
		const tw = target.width;
		const th = target.height;

		const xRatio = opt.fullSourceWidth / opt.fullTargetWidth;
		const yRatio = opt.fullSourceHeight / opt.fullTargetHeight;

		const srcData32 = new Uint32Array(opt.source.data.buffer, opt.source.data.byteOffset, opt.source.data.byteLength / 4);
		const dstData32 = new Uint32Array(target.data.buffer, target.data.byteOffset, target.data.byteLength / 4);

		for (let y = 0; y < th; y++) {
			const srcY = Math.floor((y + opt.targetY) * yRatio) - opt.sourceOffsetY;
			const clampedY = Math.max(0, Math.min(sh - 1, srcY));
			const rowOffset = clampedY * sw;
			const dstRowOffset = y * tw;

			for (let x = 0; x < tw; x++) {
				const srcX = Math.floor((x + opt.targetX) * xRatio) - opt.sourceOffsetX;
				const clampedX = Math.max(0, Math.min(sw - 1, srcX));
				dstData32[dstRowOffset + x] = srcData32[rowOffset + clampedX];
			}
		}
	}

	private static bilinearRegion(target: ImageData, opt: RegionResizeOptions): void {
		const sw = opt.source.width;
		const sh = opt.source.height;
		const tw = target.width;
		const th = target.height;
		const srcData = opt.source.data;
		const dstData = target.data;

		const xRatio = (opt.fullSourceWidth - 1) / (opt.fullTargetWidth - 1 || 1);
		const yRatio = (opt.fullSourceHeight - 1) / (opt.fullTargetHeight - 1 || 1);

		let dstIdx = 0;
		for (let y = 0; y < th; y++) {
			const srcYGlobal = (y + opt.targetY) * yRatio;
			const srcYLocal = srcYGlobal - opt.sourceOffsetY;
			
			const yT = Math.floor(srcYLocal);
			const yB = Math.min(sh - 1, yT + 1);
			const yw = Math.round((srcYLocal - yT) * 256);
			const ywInv = 256 - yw;

			const rowTopOffset = Math.max(0, yT) * sw;
			const rowBottomOffset = Math.max(0, yB) * sw;

			for (let x = 0; x < tw; x++) {
				const srcXGlobal = (x + opt.targetX) * xRatio;
				const srcXLocal = srcXGlobal - opt.sourceOffsetX;

				const xL = Math.floor(srcXLocal);
				const xR = Math.min(sw - 1, xL + 1);
				const xw = Math.round((srcXLocal - xL) * 256);
				const xwInv = 256 - xw;

				const idxTL = (rowTopOffset + Math.max(0, xL)) << 2;
				const idxTR = (rowTopOffset + Math.max(0, xR)) << 2;
				const idxBL = (rowBottomOffset + Math.max(0, xL)) << 2;
				const idxBR = (rowBottomOffset + Math.max(0, xR)) << 2;

				for (let i = 0; i < 4; i++) {
					const top = (srcData[idxTL + i] * xwInv + srcData[idxTR + i] * xw) >> 8;
					const bot = (srcData[idxBL + i] * xwInv + srcData[idxBR + i] * xw) >> 8;
					dstData[dstIdx++] = (top * ywInv + bot * yw) >> 8;
				}
			}
		}
	}
}
