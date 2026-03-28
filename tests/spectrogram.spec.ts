import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spectrum-test-"));

/** Generate a .fc32 file with a single tone */
function generateToneFC32(
  freqHz: number,
  sampleRate: number,
  durationSec: number,
): string {
  const numSamples = Math.floor(sampleRate * durationSec);
  const buf = Buffer.alloc(numSamples * 8); // 4 bytes I + 4 bytes Q
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * freqHz * t;
    buf.writeFloatLE(Math.cos(phase), i * 8);
    buf.writeFloatLE(Math.sin(phase), i * 8 + 4);
  }
  const filePath = path.join(tmpDir, "tone.fc32");
  fs.writeFileSync(filePath, buf);
  return filePath;
}

/** Generate a .sc16 file with a single tone */
function generateToneSC16(
  freqHz: number,
  sampleRate: number,
  durationSec: number,
): string {
  const numSamples = Math.floor(sampleRate * durationSec);
  const buf = Buffer.alloc(numSamples * 4); // 2 bytes I + 2 bytes Q
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * freqHz * t;
    buf.writeInt16LE(Math.round(Math.cos(phase) * 32000), i * 4);
    buf.writeInt16LE(Math.round(Math.sin(phase) * 32000), i * 4 + 2);
  }
  const filePath = path.join(tmpDir, "tone.sc16");
  fs.writeFileSync(filePath, buf);
  return filePath;
}

/** Generate a SigMF metadata file */
function generateSigMFMeta(
  baseName: string,
  sampleRate: number,
  centerFreq: number,
): string {
  const meta = {
    global: {
      "core:datatype": "cf32_le",
      "core:sample_rate": sampleRate,
      "core:frequency": centerFreq,
      "core:version": "1.0.0",
    },
    captures: [],
    annotations: [],
  };
  const filePath = path.join(tmpDir, `${baseName}.sigmf-meta`);
  fs.writeFileSync(filePath, JSON.stringify(meta));
  return filePath;
}

test.describe("Spectrum Viewer", () => {
  test("page loads with empty state", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#empty-state")).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("WebGL2 context is available", async ({ page }) => {
    await page.goto("/");
    const hasWebGL2 = await page.evaluate(() => {
      const canvas = document.getElementById(
        "spectrogram-canvas",
      ) as HTMLCanvasElement;
      return !!canvas.getContext("webgl2");
    });
    expect(hasWebGL2).toBe(true);
  });

  test("loads fc32 file and renders spectrogram", async ({ page }) => {
    await page.goto("/");
    const fixturePath = generateToneFC32(100000, 1000000, 0.1);

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(fixturePath);

    // Empty state should disappear
    await expect(page.locator("#empty-state")).toBeHidden();

    // Canvas should have non-black content
    const hasContent = await page.evaluate(() => {
      const canvas = document.getElementById(
        "spectrogram-canvas",
      ) as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
      if (!gl) return false;
      const pixels = new Uint8Array(4);
      gl.readPixels(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      // At least some color channel should be nonzero
      return pixels[0] + pixels[1] + pixels[2] > 0;
    });
    expect(hasContent).toBe(true);
  });

  test("loads sc16 file and renders spectrogram", async ({ page }) => {
    await page.goto("/");
    const fixturePath = generateToneSC16(100000, 1000000, 0.1);

    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(fixturePath);

    await expect(page.locator("#empty-state")).toBeHidden();

    const hasContent = await page.evaluate(() => {
      const canvas = document.getElementById(
        "spectrogram-canvas",
      ) as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
      if (!gl) return false;
      const pixels = new Uint8Array(4);
      gl.readPixels(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return pixels[0] + pixels[1] + pixels[2] > 0;
    });
    expect(hasContent).toBe(true);
  });

  test("cursor info appears on hover", async ({ page }) => {
    await page.goto("/");
    const fixturePath = generateToneFC32(100000, 1000000, 0.1);
    await page.locator("#file-input").setInputFiles(fixturePath);
    await expect(page.locator("#empty-state")).toBeHidden();

    const canvas = page.locator("#spectrogram-canvas");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    const cursorInfo = page.locator("#cursor-info");
    await expect(cursorInfo).toBeVisible();
    const text = await cursorInfo.textContent();
    expect(text).toContain("Time:");
    expect(text).toContain("Freq:");
    expect(text).toContain("Power:");
  });

  test("FFT size change updates spectrogram", async ({ page }) => {
    await page.goto("/");
    const fixturePath = generateToneFC32(100000, 1000000, 0.1);
    await page.locator("#file-input").setInputFiles(fixturePath);
    await expect(page.locator("#empty-state")).toBeHidden();

    // Check canvas height matches default FFT size
    const height1 = await page.evaluate(() => {
      const canvas = document.getElementById(
        "spectrogram-canvas",
      ) as HTMLCanvasElement;
      return canvas.height;
    });
    expect(height1).toBe(1024); // default FFT size

    // Change FFT size via slider (value 12 = 2^12 = 4096)
    await page.locator("#fft-size").fill("12");
    await page.locator("#fft-size").dispatchEvent("input");
    await page.waitForTimeout(200);

    // Canvas height should now match new FFT size
    const height2 = await page.evaluate(() => {
      const canvas = document.getElementById(
        "spectrogram-canvas",
      ) as HTMLCanvasElement;
      return canvas.height;
    });
    expect(height2).toBe(4096);
  });

  test("SigMF metadata populates fields", async ({ page }) => {
    await page.goto("/");
    const dataPath = generateToneFC32(100000, 2400000, 0.05);
    const metaPath = generateSigMFMeta("tone", 2400000, 915000000);

    await page.locator("#file-input").setInputFiles([dataPath, metaPath]);
    await expect(page.locator("#empty-state")).toBeHidden();

    const rate = await page.locator("#sample-rate").inputValue();
    expect(rate).toBe("2400000");

    const freq = await page.locator("#center-freq").inputValue();
    expect(freq).toBe("915000000");
  });

  test("single-file build output", async () => {
    const distDir = path.join(process.cwd(), "dist");
    const files = fs.readdirSync(distDir);
    expect(files).toEqual(["index.html"]);

    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
    // Should contain inlined script (no external script src)
    expect(html).toContain("<script");
    expect(html).not.toMatch(/src=["'][^"']*\.js["']/);
  });
});

test.afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
