import { resolveCodec } from './codec';
import type { AbstractCodec, ImageMeta } from './codec/types';

export interface RGBA {
	r: number;
	g: number;
	b: number;
	a: number;
}
export interface LAB {
	l: number;
	a: number;
	b: number;
}

export class ImageDocument {
	public readonly meta: ImageMeta;
	private imageData: ImageData;

	private constructor(imageData: ImageData, meta: ImageMeta) {
		this.imageData = imageData;
		this.meta = meta;
	}

	public static async createFromFile(file: File): Promise<ImageDocument> {
		const codec = await resolveCodec(file);
		const { imageData, meta } = await codec.decode(file);
		return new ImageDocument(imageData, meta);
	}

	public async export(codec: AbstractCodec): Promise<Blob> {
		return await codec.encode(this.imageData, this.meta);
	}

	public setPixel(x: number, y: number, color: Partial<RGBA>): void {
		if (x < 0 || y < 0 || x >= this.meta.width || y >= this.meta.height) return;

		const index = this.cordToIndex(x, y);
		const data = this.imageData.data;

		if (color.r !== undefined) data[index] = color.r;
		if (color.g !== undefined) data[index + 1] = color.g;
		if (color.b !== undefined) data[index + 2] = color.b;
		if (color.a !== undefined) data[index + 3] = color.a;
	}

	public getPixelRGBA(x: number, y: number): RGBA | null {
		if (x < 0 || y < 0 || x >= this.meta.width || y >= this.meta.height) return null;
		const index = this.cordToIndex(x, y);
		const data = this.imageData.data;

		return {
			r: data[index],
			g: data[index + 1],
			b: data[index + 2],
			a: data[index + 3]
		};
	}

	public getPixelLAB(x: number, y: number): LAB | null {
		const rgba = this.getPixelRGBA(x, y);
		if (!rgba) return null;

		return this.rgbToLab(rgba.r, rgba.g, rgba.b);
	}

	public getImageRGBA(): ImageData {
		return this.imageData;
	}

	public getImageLAB(): Float32Array {
		const pixelCount = this.imageData.width * this.imageData.height;

		// no alpha
		const labData = new Float32Array(pixelCount * 3);

		for (let i = 0; i < pixelCount; i++) {
			const pxIndex = i * 4;
			const r = this.imageData.data[pxIndex];
			const g = this.imageData.data[pxIndex + 1];
			const b = this.imageData.data[pxIndex + 2];

			const lab = this.rgbToLab(r, g, b);

			labData[i * 3] = lab.l;
			labData[i * 3 + 1] = lab.a;
			labData[i * 3 + 2] = lab.b;
		}

		return labData;
	}
	private cordToIndex(x: number, y: number): number {
		return (Math.floor(y) * this.meta.width + Math.floor(x)) * 4;
	}

	private rgbToLab(red: number, green: number, blue: number): LAB {
		let r = red / 255,
			g = green / 255,
			b = blue / 255,
			x,
			y,
			z;

		r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
		g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
		b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

		x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
		y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
		z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

		x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
		y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
		z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

		return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
	}
}
