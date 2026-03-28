import type { ColormapName } from "./types";

// Key color stops [position (0-255), R, G, B] sampled from matplotlib colormaps.
// We linearly interpolate between these to produce all 256 RGBA entries.

type ColorStop = [number, number, number, number]; // [index, r, g, b]

function interpolateStops(stops: ColorStop[]): Uint8Array {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    // Find the two surrounding stops
    let lo = 0;
    let hi = stops.length - 1;
    for (let s = 0; s < stops.length - 1; s++) {
      if (stops[s][0] <= i && stops[s + 1][0] >= i) {
        lo = s;
        hi = s + 1;
        break;
      }
    }
    const [iLo, rLo, gLo, bLo] = stops[lo];
    const [iHi, rHi, gHi, bHi] = stops[hi];
    const range = iHi - iLo;
    const t = range === 0 ? 0 : (i - iLo) / range;
    const idx = i * 4;
    data[idx] = Math.round(rLo + t * (rHi - rLo));
    data[idx + 1] = Math.round(gLo + t * (gHi - gLo));
    data[idx + 2] = Math.round(bLo + t * (bHi - bLo));
    data[idx + 3] = 255;
  }
  return data;
}

// Viridis: dark purple -> teal -> green -> yellow
const VIRIDIS_STOPS: ColorStop[] = [
  [0, 68, 1, 84],
  [16, 72, 20, 103],
  [32, 72, 37, 118],
  [48, 68, 55, 129],
  [64, 62, 72, 137],
  [80, 55, 89, 141],
  [96, 48, 105, 142],
  [112, 41, 121, 142],
  [128, 35, 137, 140],
  [144, 30, 152, 133],
  [160, 33, 167, 123],
  [176, 53, 183, 107],
  [192, 85, 198, 86],
  [208, 128, 209, 60],
  [224, 175, 216, 42],
  [240, 219, 225, 33],
  [255, 253, 231, 37],
];

// Inferno: black/dark purple -> purple -> red-orange -> yellow-white
const INFERNO_STOPS: ColorStop[] = [
  [0, 0, 0, 4],
  [16, 10, 7, 34],
  [32, 32, 12, 73],
  [48, 57, 12, 100],
  [64, 82, 10, 104],
  [80, 106, 14, 97],
  [96, 130, 22, 84],
  [112, 155, 33, 67],
  [128, 177, 48, 49],
  [144, 197, 68, 31],
  [160, 215, 95, 15],
  [176, 229, 124, 6],
  [192, 240, 155, 11],
  [208, 247, 188, 32],
  [224, 250, 218, 75],
  [240, 252, 243, 141],
  [255, 252, 255, 164],
];

export const COLORMAPS: Record<ColormapName, Uint8Array> = {
  viridis: interpolateStops(VIRIDIS_STOPS),
  inferno: interpolateStops(INFERNO_STOPS),
};

export function getColormap(name: ColormapName): Uint8Array {
  return COLORMAPS[name];
}
