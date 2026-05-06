import type { DecodedData, AbstractCodec } from './types';
import BaseNativeCodec from './nativeCodec';

export default class PNGCodec extends BaseNativeCodec implements AbstractCodec {
	constructor() {
		super('image/png');
	}

	async decode(file: File): Promise<DecodedData> {
		const imageData = await this.extractPixels(file);
		// imageDatas bit depth is unknown by the nature of canvas
		// thus reading manually
		// 8 SIG + 4 CHK_LEN + 4 IHDR_TYPE + 16 IHDR_DATA + IEND
		const headerBlob = file.slice(0, 33);
		const buffer = await headerBlob.arrayBuffer();
		const dataView = new DataView(buffer);

		// IHDR_DATA = 4 WDH + 4 HGT + 1 BIT_DEPTH + CLR_TYPE ...
		const bitDepth = dataView.getUint8(24);
		const colorType = dataView.getUint8(25);

		const channels = this.getPngChannels(colorType);

		return {
			imageData,
			meta: {
				width: imageData.width,
				height: imageData.height,
				format: 'PNG',
				channels,
				colorDepth: `${bitDepth}-bit`
			}
		};
	}

	private getPngChannels(colorType: number): 'Grayscale' | 'Grayscale + Alpha' | 'RGB' | 'RGBA' {
		switch (colorType) {
			case 0:
			case 3: 
				return 'Grayscale';
			case 2:
				return 'RGB';
			case 4:
				return 'Grayscale + Alpha';
			case 6:
				return 'RGBA';
			default:
				return 'RGB';
		}
	}
}
