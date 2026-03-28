import { SpectrogramController } from "./spectrogram";
import { setupUI } from "./ui";

const canvas = document.getElementById(
  "spectrogram-canvas",
) as HTMLCanvasElement;
const controller = new SpectrogramController(canvas);
setupUI(controller);
