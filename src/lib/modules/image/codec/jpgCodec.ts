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
				format: 'JPEG',
				channels: 'RGB',
				colorDepth: '8-bit'
			}
		};
	}
}
