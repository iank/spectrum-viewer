import FFT from "fft.js";

export function computeHannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

/**
 * Compute magnitude (dB) for a range of FFT frames.
 * Returns Float32Array of length frameCount * fftSize.
 * Each frame is fftshift'd so DC is at center.
 *
 * @param samples - interleaved IQ samples [I0, Q0, I1, Q1, ...]
 * @param fftSize - FFT size (power of 2)
 * @param window - window function coefficients (length fftSize)
 * @param sampleStart - starting complex sample index
 * @param frameCount - number of frames to compute
 * @param stride - hop size in complex samples between frames
 */
export function computeFrames(
  samples: Float32Array,
  fftSize: number,
  window: Float32Array,
  sampleStart: number,
  frameCount: number,
  stride: number,
): Float32Array {
  const fft = new FFT(fftSize);
  const input = fft.createComplexArray();
  const output = fft.createComplexArray();
  const result = new Float32Array(frameCount * fftSize);
  const half = fftSize >> 1;
  const invFFTSize = 1 / fftSize;

  for (let f = 0; f < frameCount; f++) {
    const sampleOffset = (sampleStart + f * stride) * 2; // *2 for interleaved IQ

    // Fill input with windowed complex samples
    for (let i = 0; i < fftSize; i++) {
      const w = window[i];
      input[i * 2] = samples[sampleOffset + i * 2] * w; // I
      input[i * 2 + 1] = samples[sampleOffset + i * 2 + 1] * w; // Q
    }

    fft.transform(output, input);

    // Compute magnitude in dB with fftshift (swap halves so DC is center)
    // Normalize by 1/fftSize (matches inspectrum)
    const outOffset = f * fftSize;
    for (let i = 0; i < fftSize; i++) {
      const srcBin = (i + half) % fftSize;
      const re = output[srcBin * 2] * invFFTSize;
      const im = output[srcBin * 2 + 1] * invFFTSize;
      result[outOffset + i] = 10 * Math.log10(re * re + im * im + 1e-20);
    }
  }

  return result;
}
