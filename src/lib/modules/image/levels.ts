export interface LevelSettings {
	black: number;
	white: number;
	gamma: number;
}

export interface LevelsProcessingState {
	master: LevelSettings;
	r: LevelSettings;
	g: LevelSettings;
	b: LevelSettings;
	a: LevelSettings;
}

export function createDefaultLevelsState(): LevelsProcessingState {
	return {
		master: { black: 0, white: 255, gamma: 1.0 },
		r: { black: 0, white: 255, gamma: 1.0 },
		g: { black: 0, white: 255, gamma: 1.0 },
		b: { black: 0, white: 255, gamma: 1.0 },
		a: { black: 0, white: 255, gamma: 1.0 }
	};
}

export function generateLUT(s: LevelSettings): Uint8ClampedArray {
	const lut = new Uint8ClampedArray(256);
	const range = s.white - s.black;
	const invGamma = 1 / s.gamma;

	for (let i = 0; i < 256; i++) {
		if (i <= s.black) {
			lut[i] = 0;
		} else if (i >= s.white) {
			lut[i] = 255;
		} else {
			// Normalization: (i - black) / (white - black)
			// Gamma correction: pow(norm, 1/gamma)
			lut[i] = Math.round(255 * Math.pow((i - s.black) / range, invGamma));
		}
	}
	return lut;
}

export function calculateCombinedLUTs(state: LevelsProcessingState) {
	const masterLUT = generateLUT(state.master);
	const rLUT = generateLUT(state.r);
	const gLUT = generateLUT(state.g);
	const bLUT = generateLUT(state.b);
	const aLUT = generateLUT(state.a);

	const finalRLUT = new Uint8ClampedArray(256);
	const finalGLUT = new Uint8ClampedArray(256);
	const finalBLUT = new Uint8ClampedArray(256);

	for (let i = 0; i < 256; i++) {
		const m = masterLUT[i];
		finalRLUT[i] = rLUT[m];
		finalGLUT[i] = gLUT[m];
		finalBLUT[i] = bLUT[m];
	}

	return {
		r: finalRLUT,
		g: finalGLUT,
		b: finalBLUT,
		a: aLUT
	};
}

export function calculateHistogram(data: Uint8ClampedArray) {
	const h = {
		master: new Uint32Array(256),
		r: new Uint32Array(256),
		g: new Uint32Array(256),
		b: new Uint32Array(256),
		a: new Uint32Array(256)
	};

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const a = data[i + 3];
		// Rec. 601 luma
		const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

		h.master[l]++;
		h.r[r]++;
		h.g[g]++;
		h.b[b]++;
		h.a[a]++;
	}
	return h;
}
