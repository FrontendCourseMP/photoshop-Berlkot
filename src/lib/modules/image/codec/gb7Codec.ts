import type { DecodedData, AbstractCodec } from './types';

export class GB7Codec implements AbstractCodec {
	private readonly SIGNATURE = [0x47, 0x42, 0x37, 0x1d];
	private readonly VERSION = 0x01;
	private readonly HEADER_SIZE = 12;

	public async decode(file: File): Promise<DecodedData> {
		const buffer = await file.arrayBuffer();
		const dataView = new DataView(buffer);

		if (buffer.byteLength < this.HEADER_SIZE) {
			throw new Error('Файл слишком мал и не содержит заголовка GB7.');
		}

		for (let i = 0; i < 4; i++) {
			if (dataView.getUint8(i) !== this.SIGNATURE[i]) {
				throw new Error('Неверная сигнатура файла. Это не GrayBit-7.');
			}
		}

		const version = dataView.getUint8(4);
		if (version !== this.VERSION) {
			console.warn(
				`Неизвестная версия GB7: ${version}. Ожидалась ${this.VERSION}. Возможны ошибки.`
			);
		}
		// header
		const flags = dataView.getUint8(5);
		const hasMask = (flags & 0x01) !== 0;

		const width = dataView.getUint16(6, false);
		const height = dataView.getUint16(8, false);

		const expectedDataSize = width * height;
		if (buffer.byteLength < this.HEADER_SIZE + expectedDataSize) {
			throw new Error('Файл поврежден: данных меньше, чем заявлено в заголовке.');
		}

		const imageData = new ImageData(width, height);
		const pixels = imageData.data;
		let offset = this.HEADER_SIZE;

		for (let i = 0; i < expectedDataSize; i++) {
			const byte = dataView.getUint8(offset++);

			const gray7bit = byte & 0x7f;
			const maskBit = (byte & 0x80) !== 0;

			const color8bit = Math.round((gray7bit / 127) * 255);

			const pxIndex = i * 4;
			pixels[pxIndex] = color8bit;
			pixels[pxIndex + 1] = color8bit;
			pixels[pxIndex + 2] = color8bit;

			if (hasMask) {
				pixels[pxIndex + 3] = maskBit ? 255 : 0;
			} else {
				pixels[pxIndex + 3] = 255;
			}
		}

		return {
			imageData,
			meta: {
				width,
				height,
				colorDepth: hasMask ? '7-bit GB7 (+ Mask)' : '7-bit GB7'
			}
		};
	}

	public async encode(imageData: ImageData): Promise<Blob> {
		const { width, height, data } = imageData;
		const pixelCount = width * height;

		// does image contain transparent pixels?
		let useMask = false;
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] === 0) {
				useMask = true;
				break;
			}
		}

		const fileSize = this.HEADER_SIZE + pixelCount;
		const buffer = new ArrayBuffer(fileSize);
		const dataView = new DataView(buffer);

		// header
		dataView.setUint8(0, this.SIGNATURE[0]);
		dataView.setUint8(1, this.SIGNATURE[1]);
		dataView.setUint8(2, this.SIGNATURE[2]);
		dataView.setUint8(3, this.SIGNATURE[3]);

		dataView.setUint8(4, this.VERSION);
		dataView.setUint8(5, useMask ? 0x01 : 0x00);
		dataView.setUint16(6, width, false);
		dataView.setUint16(8, height, false);
		dataView.setUint16(10, 0x0000, false);

		let offset = this.HEADER_SIZE;

		const backgroundLuminance = 255;

		for (let i = 0; i < pixelCount; i++) {
			// array offset
			const pxIndex = i * 4;
			const r = data[pxIndex];
			const g = data[pxIndex + 1];
			const b = data[pxIndex + 2];
			const a = data[pxIndex + 3];

			// REC.601 luma
			const pixelLuminance = 0.299 * r + 0.587 * g + 0.114 * b;
			let byte: number;

			if (a === 0) {
				// Dont use matting on fully transparent pixels
				byte = Math.round((pixelLuminance / 255) * 127) & 0x7f;
			} else {
				// force 8 bit
				const alphaNorm = a / 255;

				// add matting
				const finalLuminance = pixelLuminance * alphaNorm + backgroundLuminance * (1 - alphaNorm);

				// 7 bit compression
				byte = Math.round((finalLuminance / 255) * 127) & 0x7f;

				// set mask
				if (useMask) {
					byte = byte | 0x80;
				}
			}

			dataView.setUint8(offset++, byte);
		}
		return new Blob([buffer], { type: 'application/octet-stream' });
	}
}
