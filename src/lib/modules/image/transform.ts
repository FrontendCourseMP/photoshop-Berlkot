export type InterpolationMethod = 'nearest' | 'bilinear';

export interface ResizeOptions {
	width: number;
	height: number;
	method: InterpolationMethod;
}

export class ImageTransformer {
	public static resize(source: ImageData, options: ResizeOptions): ImageData {
		const { width: targetWidth, height: targetHeight, method } = options;
		const targetData = new ImageData(targetWidth, targetHeight);

		if (method === 'nearest') {
			this.nearestNeighbor(source, targetData);
		} else {
			this.bilinear(source, targetData);
		}

		return targetData;
	}

	private static nearestNeighbor(source: ImageData, target: ImageData): void {
		const sw = source.width;
		const sh = source.height;
		const tw = target.width;
		const th = target.height;
		const srcData = source.data;
		const dstData = target.data;

		const xRatio = sw / tw;
		const yRatio = sh / th;

		for (let y = 0; y < th; y++) {
			for (let x = 0; x < tw; x++) {
				const px = Math.floor(x * xRatio);
				const py = Math.floor(y * yRatio);

				const srcIdx = (py * sw + px) * 4;
				const dstIdx = (y * tw + x) * 4;

				dstData[dstIdx] = srcData[srcIdx];
				dstData[dstIdx + 1] = srcData[srcIdx + 1];
				dstData[dstIdx + 2] = srcData[srcIdx + 2];
				dstData[dstIdx + 3] = srcData[srcIdx + 3];
			}
		}
	}

	private static bilinear(source: ImageData, target: ImageData): void {
		const sw = source.width;
		const sh = source.height;
		const tw = target.width;
		const th = target.height;
		const srcData = source.data;
		const dstData = target.data;

		const xRatio = (sw - 1) / tw;
		const yRatio = (sh - 1) / th;

		for (let y = 0; y < th; y++) {
			for (let x = 0; x < tw; x++) {
				const xL = Math.floor(x * xRatio);
				const yT = Math.floor(y * yRatio);
				const xR = Math.min(sw - 1, xL + 1);
				const yB = Math.min(sh - 1, yT + 1);

				const xWeight = x * xRatio - xL;
				const yWeight = y * yRatio - yT;

				const idxTL = (yT * sw + xL) * 4;
				const idxTR = (yT * sw + xR) * 4;
				const idxBL = (yB * sw + xL) * 4;
				const idxBR = (yB * sw + xR) * 4;

				const dstIdx = (y * tw + x) * 4;

				for (let i = 0; i < 4; i++) {
					const valT = srcData[idxTL + i] * (1 - xWeight) + srcData[idxTR + i] * xWeight;
					const valB = srcData[idxBL + i] * (1 - xWeight) + srcData[idxBR + i] * xWeight;
					dstData[dstIdx + i] = Math.round(valT * (1 - yWeight) + valB * yWeight);
				}
			}
		}
	}
}
