import type { ImageMeta } from './types';

// OffscreenCanvas is in Baseline https://caniuse.com/offscreencanvas
export default class BaseNativeCodec {
	protected mimeType: string;

	constructor(mimeType: string) {
		this.mimeType = mimeType;
	}

	protected async extractPixels(file: File): Promise<ImageData> {
		const bitmap = await createImageBitmap(file);
		// ImageBitmap must be drawn somewere to get pixel data
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const ctx = canvas.getContext('2d')!;

		ctx.drawImage(bitmap, 0, 0);
		return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
	}

	// canvas wont allow us to save any other bit deth other than 8 with alpha
	// expect file size to be much larger than expected
	// and png will fall back to 8-bit RGBA ughhhhh
	async encode(imageData: ImageData, meta: ImageMeta): Promise<Blob> {
		const canvas = new OffscreenCanvas(meta.width, meta.height);
		canvas.getContext('2d')!.putImageData(imageData, 0, 0);
		return await canvas.convertToBlob({ type: this.mimeType });
	}
}
