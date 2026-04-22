import type { DecodedData, AbstractCodec } from './types';
import BaseNativeCodec from './nativeCodec';

export default class JPEGCodec extends BaseNativeCodec implements AbstractCodec {
	constructor() {
		super('image/jpeg');
	}

	async decode(file: File): Promise<DecodedData> {
		const imageData = await this.extractPixels(file);
		return {
			imageData,
			meta: {
				width: imageData.width,
				height: imageData.height,
				colorDepth: '24-bit JPEG' // it can't be encoded as any other bit depth?
			}
		};
	}
}
