export interface IQFile {
  name: string;
  format: "fc32" | "sc16";
  samples: Float32Array; // interleaved [I0, Q0, I1, Q1, ...]
  sampleCount: number; // number of complex samples
}

export interface SpectrogramParams {
  fftSize: number;
  overlap: number; // 0..1
}

export interface ViewState {
  startFrame: number;
  visibleFrames: number;
  totalFrames: number;
  dbMin: number;
  dbMax: number;
  sampleRate: number;
  centerFrequency: number;
}

export interface CursorInfo {
  timeSeconds: number;
  frequencyHz: number;
  magnitudeDb: number;
}

export type ColormapName = "viridis" | "inferno";
