import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { GB7Codec } from './gb7Codec';

beforeAll(() => {
	if (typeof globalThis.ImageData === 'undefined') {
		globalThis.ImageData = class ImageData {
			public data: Uint8ClampedArray;
			public width: number;
			public height: number;

			constructor(width: number, height: number) {
				this.width = width;
				this.height = height;
				this.data = new Uint8ClampedArray(width * height * 4);
			}
		} as any;
	}
});

function loadFixture(filename: string): File {
	const fileUrl = new URL(`./fixtures/${filename}`, import.meta.url);
	const buffer = readFileSync(fileUrl);

	return new File([buffer], filename, { type: 'application/octet-stream' });
}

describe('GB7Codec', () => {
	const codec = new GB7Codec();

	it('должен корректно декодировать vertical-kapibara.gb7 (без маски)', async () => {
		const file = loadFixture('vertical-kapibara.gb7');
		const result = await codec.decode(file);

		expect(result.meta.colorDepth).toBe('7-bit GB7');
		expect(result.meta.width).toBeGreaterThan(0);
		expect(result.meta.height).toBeGreaterThan(result.meta.width);

		const pixels = result.imageData.data;
		let allOpaque = true;
		for (let i = 3; i < pixels.length; i += 4) {
			if (pixels[i] !== 255) {
				allOpaque = false;
				break;
			}
		}
		expect(allOpaque).toBe(true);
	});

	it('должен корректно декодировать kapibara-mask.gb7 (с маской)', async () => {
		const file = loadFixture('kapibara-mask.gb7');
		const result = await codec.decode(file);

		expect(result.meta.colorDepth).toBe('7-bit GB7 (+ Mask)');

		const pixels = result.imageData.data;
		let hasTransparentPixel = false;
		let hasOpaquePixel = false;

		for (let i = 3; i < pixels.length; i += 4) {
			if (pixels[i] === 0) hasTransparentPixel = true;
			if (pixels[i] === 255) hasOpaquePixel = true;
		}

		expect(hasTransparentPixel).toBe(true);
		expect(hasOpaquePixel).toBe(true);
	});

	it('должен симметрично декодировать и кодировать gradient-half-mask.gb7', async () => {
		const file = loadFixture('gradient-half-mask.gb7');
		const originalResult = await codec.decode(file);

		const encodedBlob = await codec.encode(originalResult.imageData);
		const encodedFile = new File([await encodedBlob.arrayBuffer()], 'encoded.gb7');
		const finalResult = await codec.decode(encodedFile);

		expect(finalResult.meta.width).toBe(originalResult.meta.width);
		expect(finalResult.meta.height).toBe(originalResult.meta.height);

		const originalPixels = originalResult.imageData.data;
		const finalPixels = finalResult.imageData.data;

		expect(finalPixels.length).toBe(originalPixels.length);

		const isIdentical = originalPixels.every((val, index) => val === finalPixels[index]);
		expect(isIdentical).toBe(true);
	});
});
