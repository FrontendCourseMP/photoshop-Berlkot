import { GB7Codec } from './gb7Codec';
import PNGCodec from './pngCodec';
import JPEGCodec from './jpgCodec';
import type { AbstractCodec } from './types';

export const Codec = {
	GB7: new GB7Codec(),
	PNG: new PNGCodec(),
	JPG: new JPEGCodec()
};
// let's just assume that this is enough for now
export async function resolveCodec(file: File): Promise<AbstractCodec> {
	const headerBlob = file.slice(0, 8);
	const buffer = await headerBlob.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	if (bytes[0] === 0x47 && bytes[1] === 0x42 && bytes[2] === 0x37 && bytes[3] === 0x1d) {
		return Codec.GB7;
	}

	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return Codec.PNG;
	}

	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		return Codec.JPG;
	}

	throw new Error('Неподдерживаемый или поврежденный формат файла');
}
