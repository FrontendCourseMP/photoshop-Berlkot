import type { DecodedData, AbstractCodec } from './types';
import BaseNativeCodec from './nativeCodec';

export default class PNGCodec extends BaseNativeCodec implements AbstractCodec {
	constructor() {
		super('image/png');
	}

  async decode(file: File): Promise<DecodedData> {
    // how canvas will return 1-bit png?
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

		const colorDepthString = this.getPngColorDepthInfo(bitDepth, colorType);

		return {
			imageData,
			meta: {
				width: imageData.width,
				height: imageData.height,
				colorDepth: colorDepthString
			}
		};
	}
	private getPngColorDepthInfo(bitDepth: number, colorType: number): string {
		// colorType: 0 (Grayscale), 2 (RGB), 3 (Palette), 4 (Grayscale+Alpha), 6 (RGBA)
		switch (colorType) {
			case 0:
				return `${bitDepth}-bit Grayscale`;
			case 2:
				return `${bitDepth * 3}-bit RGB`;
			case 3:
				return `${bitDepth}-bit Indexed`;
			case 4:
				return `${bitDepth * 2}-bit Grayscale + Alpha`;
			case 6:
				return `${bitDepth * 4}-bit RGBA`;
			default:
				return `Unknown PNG Depth`;
		}
	}
}
