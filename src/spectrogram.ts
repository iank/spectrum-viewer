import type { IQFile, ViewState, CursorInfo, ColormapName } from "./types";
import { SpectrogramRenderer } from "./renderer";
import { computeHannWindow, computeFrames } from "./fft-processor";
import { getColormap } from "./colormap";

export class SpectrogramController {
  private canvas: HTMLCanvasElement;
  private renderer: SpectrogramRenderer;
  private iqFile: IQFile | null = null;
  private window: Float32Array | null = null;
  private view: ViewState = {
    startFrame: 0,
    visibleFrames: 0,
    totalFrames: 0,
    dbMin: -80,
    dbMax: 0,
    sampleRate: 1_000_000,
    centerFrequency: 0,
  };
  private fftSize = 1024;
  private onViewChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new SpectrogramRenderer(canvas);
    this.renderer.setColormap(getColormap("viridis"));
    this.resizeCanvas();
  }

  get viewState(): ViewState {
    return { ...this.view };
  }

  get currentFFTSize(): number {
    return this.fftSize;
  }

  setOnViewChange(cb: () => void): void {
    this.onViewChange = cb;
  }

  /**
   * totalFrames uses stride=fftSize (0% overlap) as the base unit.
   * Each "frame" represents fftSize samples of advancement.
   * Actual rendering computes with finer stride automatically.
   */
  private recomputeTotalFrames(): void {
    if (!this.iqFile) return;
    const totalSamples = this.iqFile.sampleCount;
    if (totalSamples < this.fftSize) {
      this.view.totalFrames = 0;
      return;
    }
    // One frame per fftSize samples (no overlap base)
    this.view.totalFrames = Math.floor((totalSamples - this.fftSize) / this.fftSize) + 1;
  }

  loadFile(file: IQFile): void {
    this.iqFile = file;
    this.window = computeHannWindow(this.fftSize);
    this.recomputeTotalFrames();
    this.view.startFrame = 0;
    this.view.visibleFrames = this.view.totalFrames;
    this.updateView();
  }

  setFFTSize(size: number): void {
    if (size === this.fftSize) return;
    this.fftSize = size;
    this.window = computeHannWindow(size);
    if (this.iqFile) {
      this.recomputeTotalFrames();
      this.view.startFrame = 0;
      this.view.visibleFrames = this.view.totalFrames;
      this.updateView();
    }
  }

  setSampleRate(rate: number): void {
    this.view.sampleRate = rate;
    this.onViewChange?.();
  }

  setCenterFrequency(freq: number): void {
    this.view.centerFrequency = freq;
    this.onViewChange?.();
  }

  setDbRange(min: number, max: number): void {
    this.view.dbMin = min;
    this.view.dbMax = max;
    this.renderer.setDbRange(min, max);
    this.renderer.render();
  }

  setColormap(name: ColormapName): void {
    this.renderer.setColormap(getColormap(name));
    this.renderer.render();
  }

  zoomTime(factor: number, centerPixelX: number): void {
    if (this.view.totalFrames === 0) return;

    const canvasWidth = this.canvas.clientWidth;
    const centerFraction = centerPixelX / canvasWidth;
    const centerFrame =
      this.view.startFrame + centerFraction * this.view.visibleFrames;

    const minVisible = Math.min(2, this.view.totalFrames);
    let newVisible = Math.round(this.view.visibleFrames * factor);
    newVisible = Math.max(minVisible, Math.min(this.view.totalFrames, newVisible));

    let newStart = Math.round(centerFrame - centerFraction * newVisible);
    newStart = Math.max(0, Math.min(this.view.totalFrames - newVisible, newStart));

    this.view.startFrame = newStart;
    this.view.visibleFrames = newVisible;
    this.updateView();
  }

  scrollTime(deltaFrames: number): void {
    if (this.view.totalFrames === 0) return;
    const maxStart = this.view.totalFrames - this.view.visibleFrames;
    let newStart = this.view.startFrame + Math.round(deltaFrames);
    newStart = Math.max(0, Math.min(maxStart, newStart));
    if (newStart === this.view.startFrame) return;
    this.view.startFrame = newStart;
    this.updateView();
  }

  setStartFrame(frame: number): void {
    const maxStart = Math.max(0, this.view.totalFrames - this.view.visibleFrames);
    this.view.startFrame = Math.max(0, Math.min(maxStart, Math.round(frame)));
    this.updateView();
  }

  pixelToTimeFreq(pixelX: number, pixelY: number): CursorInfo {
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;

    // Time: pixel X maps into the visible sample range
    const fraction = pixelX / canvasWidth;
    const startSample = this.view.startFrame * this.fftSize;
    const visibleSamples = this.view.visibleFrames * this.fftSize;
    const sampleIndex = startSample + fraction * visibleSamples;
    const timeSeconds = sampleIndex / this.view.sampleRate;

    // Frequency: pixel Y maps to frequency bins
    const binFraction = 1 - pixelY / canvasHeight;
    const freqOffset = (binFraction - 0.5) * this.view.sampleRate;
    const frequencyHz = this.view.centerFrequency + freqOffset;

    // Magnitude from renderer
    const u = pixelX / canvasWidth;
    const v = 1 - pixelY / canvasHeight;
    const magnitudeDb = this.renderer.sampleAt(u, v);

    return { timeSeconds, frequencyHz, magnitudeDb };
  }

  resizeCanvas(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.iqFile) {
      this.updateView();
    }
  }

  private updateView(): void {
    if (!this.iqFile || !this.window) return;

    const canvasWidth = this.canvas.width;
    if (canvasWidth <= 0) return;

    // How many samples are visible in the current view
    const startSample = this.view.startFrame * this.fftSize;
    const visibleSamples = this.view.visibleFrames * this.fftSize;

    // Number of texture columns: at most one per canvas pixel
    const textureColumns = Math.min(
      Math.max(1, Math.floor(visibleSamples / this.fftSize)),
      canvasWidth,
    );

    // Auto-compute stride: spread textureColumns frames evenly across visible samples
    // Like inspectrum: stride = fftSize / zoomLevel
    const stride = Math.max(1, Math.floor(visibleSamples / textureColumns));

    // Ensure we don't read past the end of the sample buffer
    const maxStartSample = this.iqFile.sampleCount - this.fftSize;
    const clampedStart = Math.min(startSample, Math.max(0, maxStartSample));

    // Ensure last frame doesn't exceed buffer
    const lastFrameStart = clampedStart + (textureColumns - 1) * stride;
    let actualColumns = textureColumns;
    if (lastFrameStart + this.fftSize > this.iqFile.sampleCount) {
      actualColumns = Math.max(1, Math.floor(
        (this.iqFile.sampleCount - this.fftSize - clampedStart) / stride,
      ) + 1);
    }

    const magnitudes = computeFrames(
      this.iqFile.samples,
      this.fftSize,
      this.window,
      clampedStart,
      actualColumns,
      stride,
    );

    this.renderer.setDbRange(this.view.dbMin, this.view.dbMax);
    this.renderer.updateSpectrogram(magnitudes, this.fftSize, actualColumns);
    this.renderer.render();
    this.onViewChange?.();
  }
}
