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

		const xRatio = sw / tw;
		const yRatio = sh / th;

		const xSrc = new Int32Array(tw);
		for (let x = 0; x < tw; x++) {
			xSrc[x] = Math.floor(x * xRatio);
		}

		const ySrc = new Int32Array(th);
		for (let y = 0; y < th; y++) {
			ySrc[y] = Math.floor(y * yRatio);
		}

		const srcData32 = new Uint32Array(source.data.buffer, source.data.byteOffset, source.data.byteLength / 4);
		const dstData32 = new Uint32Array(target.data.buffer, target.data.byteOffset, target.data.byteLength / 4);

		for (let y = 0; y < th; y++) {
			const rowOffset = ySrc[y] * sw;
			const dstRowOffset = y * tw;
			for (let x = 0; x < tw; x++) {
				dstData32[dstRowOffset + x] = srcData32[rowOffset + xSrc[x]];
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

		const xL = new Int32Array(tw);
		const xR = new Int32Array(tw);
		const xWeightInt = new Int32Array(tw);

		for (let x = 0; x < tw; x++) {
			const srcX = x * xRatio;
			xL[x] = Math.floor(srcX);
			xR[x] = Math.min(sw - 1, xL[x] + 1);
			xWeightInt[x] = Math.round((srcX - xL[x]) * 256);
		}

		const yT = new Int32Array(th);
		const yB = new Int32Array(th);
		const yWeightInt = new Int32Array(th);

		for (let y = 0; y < th; y++) {
			const srcY = y * yRatio;
			yT[y] = Math.floor(srcY);
			yB[y] = Math.min(sh - 1, yT[y] + 1);
			yWeightInt[y] = Math.round((srcY - yT[y]) * 256);
		}

		let dstIdx = 0;
		for (let y = 0; y < th; y++) {
			const yt = yT[y];
			const yb = yB[y];
			const yw = yWeightInt[y];
			const ywInv = 256 - yw;

			const rowTopOffset = yt * sw;
			const rowBottomOffset = yb * sw;

			for (let x = 0; x < tw; x++) {
				const xl = xL[x];
				const xr = xR[x];
				const xw = xWeightInt[x];
				const xwInv = 256 - xw;

				const idxTL = (rowTopOffset + xl) << 2;
				const idxTR = (rowTopOffset + xr) << 2;
				const idxBL = (rowBottomOffset + xl) << 2;
				const idxBR = (rowBottomOffset + xr) << 2;

				for (let i = 0; i < 4; i++) {
					const top = (srcData[idxTL + i] * xwInv + srcData[idxTR + i] * xw) >> 8;
					const bot = (srcData[idxBL + i] * xwInv + srcData[idxBR + i] * xw) >> 8;
					dstData[dstIdx++] = (top * ywInv + bot * yw) >> 8;
				}
			}
		}
	}
}
