import type { IQFile } from "./types";

export function parseIQFile(name: string, buffer: ArrayBuffer): IQFile {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "fc32") {
    return parseFc32(name, buffer);
  } else if (ext === "sc16") {
    return parseSc16(name, buffer);
  }
  throw new Error(`Unsupported file format: .${ext}`);
}

function parseFc32(name: string, buffer: ArrayBuffer): IQFile {
  const samples = new Float32Array(buffer);
  return {
    name,
    format: "fc32",
    samples,
    sampleCount: samples.length / 2,
  };
}

function parseSc16(name: string, buffer: ArrayBuffer): IQFile {
  const raw = new Int16Array(buffer);
  const samples = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    samples[i] = raw[i] / 32768;
  }
  return {
    name,
    format: "sc16",
    samples,
    sampleCount: samples.length / 2,
  };
}
