declare module "fft.js" {
  class FFT {
    constructor(size: number);
    size: number;
    createComplexArray(): Float64Array;
    toComplexArray(
      input: ArrayLike<number>,
      storage?: Float64Array,
    ): Float64Array;
    fromComplexArray(
      complex: Float64Array,
      storage?: Float64Array,
    ): Float64Array;
    transform(output: Float64Array, input: Float64Array): void;
    realTransform(output: Float64Array, input: Float64Array): void;
    completeSpectrum(spectrum: Float64Array): void;
  }
  export = FFT;
}
