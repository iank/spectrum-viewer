import { SpectrogramController } from "./spectrogram";
import { parseIQFile } from "./iq-parser";
import { parseSigMF, findSigMFFile } from "./sigmf";
import type { ColormapName } from "./types";

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function formatFrequency(hz: number): string {
  const abs = Math.abs(hz);
  if (abs >= 1e9) return (hz / 1e9).toFixed(6) + " GHz";
  if (abs >= 1e6) return (hz / 1e6).toFixed(3) + " MHz";
  if (abs >= 1e3) return (hz / 1e3).toFixed(1) + " kHz";
  return hz.toFixed(1) + " Hz";
}

function formatTime(seconds: number): string {
  if (seconds >= 1) return seconds.toFixed(4) + " s";
  if (seconds >= 1e-3) return (seconds * 1e3).toFixed(3) + " ms";
  return (seconds * 1e6).toFixed(1) + " \u00B5s";
}

export function setupUI(controller: SpectrogramController): void {
  const openBtn = $("open-btn") as HTMLButtonElement;
  const fileInput = $("file-input") as HTMLInputElement;
  const fftSelect = $("fft-size") as HTMLSelectElement;
  const sampleRateInput = $("sample-rate") as HTMLInputElement;
  const centerFreqInput = $("center-freq") as HTMLInputElement;
  const dbMinInput = $("db-min") as HTMLInputElement;
  const dbMaxInput = $("db-max") as HTMLInputElement;
  const colormapSelect = $("colormap") as HTMLSelectElement;
  const canvas = $("spectrogram-canvas") as HTMLCanvasElement;
  const cursorInfo = $("cursor-info");
  const dropOverlay = $("drop-overlay");
  const scrollbar = $("scrollbar") as HTMLInputElement;
  const emptyState = $("empty-state");
  const container = $("canvas-container");

  let fileLoaded = false;

  // File handling
  openBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) {
      handleFiles(Array.from(fileInput.files));
    }
  });

  // Drag and drop
  let dragCounter = 0;
  container.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    dropOverlay.style.display = "flex";
  });
  container.addEventListener("dragleave", () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.style.display = "none";
    }
  });
  container.addEventListener("dragover", (e) => e.preventDefault());
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.style.display = "none";
    if (e.dataTransfer?.files.length) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  });

  async function handleFiles(files: File[]): Promise<void> {
    // Find the data file
    const dataFile = files.find((f) => {
      const ext = f.name.toLowerCase().split(".").pop();
      return ext === "fc32" || ext === "sc16";
    });
    if (!dataFile) return;

    // Check for SigMF sidecar
    const sigmfFile = findSigMFFile(files, dataFile.name);
    if (sigmfFile) {
      const text = await sigmfFile.text();
      const meta = parseSigMF(text);
      if (meta.sampleRate !== null) {
        sampleRateInput.value = String(meta.sampleRate);
        controller.setSampleRate(meta.sampleRate);
      }
      if (meta.centerFrequency !== null) {
        centerFreqInput.value = String(meta.centerFrequency);
        controller.setCenterFrequency(meta.centerFrequency);
      }
    }

    const buffer = await dataFile.arrayBuffer();
    const iqFile = parseIQFile(dataFile.name, buffer);
    controller.loadFile(iqFile);
    fileLoaded = true;
    emptyState.style.display = "none";
    updateScrollbar();
  }

  // Controls
  fftSelect.addEventListener("change", () => {
    controller.setFFTSize(Number(fftSelect.value));
    updateScrollbar();
  });

  sampleRateInput.addEventListener("change", () => {
    controller.setSampleRate(Number(sampleRateInput.value));
  });

  centerFreqInput.addEventListener("change", () => {
    controller.setCenterFrequency(Number(centerFreqInput.value));
  });

  dbMinInput.addEventListener("change", () => {
    controller.setDbRange(
      Number(dbMinInput.value),
      Number(dbMaxInput.value),
    );
  });
  dbMaxInput.addEventListener("change", () => {
    controller.setDbRange(
      Number(dbMinInput.value),
      Number(dbMaxInput.value),
    );
  });

  colormapSelect.addEventListener("change", () => {
    controller.setColormap(colormapSelect.value as ColormapName);
  });

  // Scrollbar
  scrollbar.addEventListener("input", () => {
    controller.setStartFrame(Number(scrollbar.value));
  });

  function updateScrollbar(): void {
    const v = controller.viewState;
    scrollbar.max = String(Math.max(0, v.totalFrames - v.visibleFrames));
    scrollbar.value = String(v.startFrame);
  }

  controller.setOnViewChange(updateScrollbar);

  // Mouse events on canvas
  canvas.addEventListener("mousemove", (e) => {
    if (!fileLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const info = controller.pixelToTimeFreq(x, y);
    cursorInfo.style.display = "block";
    cursorInfo.textContent =
      `Time: ${formatTime(info.timeSeconds)}\n` +
      `Freq: ${formatFrequency(info.frequencyHz)}\n` +
      `Power: ${info.magnitudeDb.toFixed(1)} dB`;
  });

  canvas.addEventListener("mouseleave", () => {
    cursorInfo.style.display = "none";
  });

  // Zoom: Ctrl+wheel or pinch
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!fileLoaded) return;
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        controller.zoomTime(factor, x);
      } else {
        // Scroll
        const v = controller.viewState;
        const delta = e.deltaY * v.visibleFrames * 0.05;
        controller.scrollTime(delta);
      }
    },
    { passive: false },
  );

  // Click-drag to scroll
  let dragging = false;
  let dragStartX = 0;
  let dragStartFrame = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (!fileLoaded || e.button !== 0) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartFrame = controller.viewState.startFrame;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const v = controller.viewState;
    const framesPerPixel = v.visibleFrames / canvas.clientWidth;
    const deltaFrames = -dx * framesPerPixel;
    controller.setStartFrame(dragStartFrame + deltaFrames);
  });

  window.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      canvas.style.cursor = "";
    }
  });

  // Resize handling
  const resizeObserver = new ResizeObserver(() => {
    controller.resizeCanvas();
  });
  resizeObserver.observe(container);
}
