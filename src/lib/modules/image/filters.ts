export type EdgeHandling = 'black' | 'white' | 'copy';

export interface ConvolutionOptions {
	kernel: number[][];
	channels: { r: boolean; g: boolean; b: boolean; a: boolean };
	edgeHandling: EdgeHandling;
	abortSignal?: AbortSignal;
}

export class ImageFilters {
	public static async applyConvolution(
		source: ImageData,
		options: ConvolutionOptions
	): Promise<ImageData | null> {
		const { width: w, height: h, data: src } = source;
		const { kernel, channels, edgeHandling, abortSignal } = options;
		const target = new ImageData(w, h);
		const dst = target.data;

		const k = kernel.flat();
		const applyR = channels.r;
		const applyG = channels.g;
		const applyB = channels.b;
		const applyA = channels.a;

		const pw = w + 2;
		const ph = h + 2;
		const padded = new Uint8ClampedArray(pw * ph * 4);

		for (let y = 0; y < ph; y++) {
			if (abortSignal?.aborted) return null;
			for (let x = 0; x < pw; x++) {
				const srcX = x - 1;
				const srcY = y - 1;
				const dstIdx = (y * pw + x) * 4;

				if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
					const srcIdx = (srcY * w + srcX) * 4;
					padded[dstIdx] = src[srcIdx];
					padded[dstIdx + 1] = src[srcIdx + 1];
					padded[dstIdx + 2] = src[srcIdx + 2];
					padded[dstIdx + 3] = src[srcIdx + 3];
				} else {
					if (edgeHandling === 'black') {
						padded[dstIdx] = 0;
						padded[dstIdx + 1] = 0;
						padded[dstIdx + 2] = 0;
						padded[dstIdx + 3] = 255;
					} else if (edgeHandling === 'white') {
						padded[dstIdx] = 255;
						padded[dstIdx + 1] = 255;
						padded[dstIdx + 2] = 255;
						padded[dstIdx + 3] = 255;
					} else {
						const cx = Math.max(0, Math.min(w - 1, srcX));
						const cy = Math.max(0, Math.min(h - 1, srcY));
						const srcIdx = (cy * w + cx) * 4;
						padded[dstIdx] = src[srcIdx];
						padded[dstIdx + 1] = src[srcIdx + 1];
						padded[dstIdx + 2] = src[srcIdx + 2];
						padded[dstIdx + 3] = src[srcIdx + 3];
					}
				}
			}
		}

		const CHUNK_SIZE = 16;
		const rowPadded = pw * 4;

		for (let y = 0; y < h; y += CHUNK_SIZE) {
			if (abortSignal?.aborted) return null;
			const endY = Math.min(y + CHUNK_SIZE, h);

			for (let curY = y; curY < endY; curY++) {
				const dstRowOffset = curY * w * 4;
				const pRowT = curY * rowPadded;
				const pRowM = (curY + 1) * rowPadded;
				const pRowB = (curY + 2) * rowPadded;

				for (let curX = 0; curX < w; curX++) {
					const dstIdx = dstRowOffset + curX * 4;
					const px = (curX + 1) * 4;

					const i0 = pRowT + px - 4, i1 = pRowT + px, i2 = pRowT + px + 4;
					const i3 = pRowM + px - 4, i4 = pRowM + px, i5 = pRowM + px + 4;
					const i6 = pRowB + px - 4, i7 = pRowB + px, i8 = pRowB + px + 4;

					if (applyR) {
						let sum = padded[i0] * k[0] + padded[i1] * k[1] + padded[i2] * k[2] +
						          padded[i3] * k[3] + padded[i4] * k[4] + padded[i5] * k[5] +
						          padded[i6] * k[6] + padded[i7] * k[7] + padded[i8] * k[8];
						dst[dstIdx] = Math.max(0, Math.min(255, sum));
					} else {
						dst[dstIdx] = src[dstIdx];
					}

					if (applyG) {
						let sum = padded[i0+1] * k[0] + padded[i1+1] * k[1] + padded[i2+1] * k[2] +
						          padded[i3+1] * k[3] + padded[i4+1] * k[4] + padded[i5+1] * k[5] +
						          padded[i6+1] * k[6] + padded[i7+1] * k[7] + padded[i8+1] * k[8];
						dst[dstIdx + 1] = Math.max(0, Math.min(255, sum));
					} else {
						dst[dstIdx + 1] = src[dstIdx + 1];
					}

					if (applyB) {
						let sum = padded[i0+2] * k[0] + padded[i1+2] * k[1] + padded[i2+2] * k[2] +
						          padded[i3+2] * k[3] + padded[i4+2] * k[4] + padded[i5+2] * k[5] +
						          padded[i6+2] * k[6] + padded[i7+2] * k[7] + padded[i8+2] * k[8];
						dst[dstIdx + 2] = Math.max(0, Math.min(255, sum));
					} else {
						dst[dstIdx + 2] = src[dstIdx + 2];
					}

					if (applyA) {
						let sum = padded[i0+3] * k[0] + padded[i1+3] * k[1] + padded[i2+3] * k[2] +
						          padded[i3+3] * k[3] + padded[i4+3] * k[4] + padded[i5+3] * k[5] +
						          padded[i6+3] * k[6] + padded[i7+3] * k[7] + padded[i8+3] * k[8];
						dst[dstIdx + 3] = Math.max(0, Math.min(255, sum));
					} else {
						dst[dstIdx + 3] = src[dstIdx + 3];
					}
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		return target;
	}
}

export const PRESET_KERNELS: Record<string, number[][]> = {
	identity: [
		[0, 0, 0],
		[0, 1, 0],
		[0, 0, 0]
	],
	sharpen: [
		[0, -1, 0],
		[-1, 5, -1],
		[0, -1, 0]
	],
	gaussian: [
		[1 / 16, 2 / 16, 1 / 16],
		[2 / 16, 4 / 16, 2 / 16],
		[1 / 16, 2 / 16, 1 / 16]
	],
	boxBlur: [
		[1 / 9, 1 / 9, 1 / 9],
		[1 / 9, 1 / 9, 1 / 9],
		[1 / 9, 1 / 9, 1 / 9]
	],
	prewittX: [
		[-1, 0, 1],
		[-1, 0, 1],
		[-1, 0, 1]
	],
	prewittY: [
		[-1, -1, -1],
		[ 0,  0,  0],
		[ 1,  1,  1]
	]
};
