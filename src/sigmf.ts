export interface SigMFMetadata {
  sampleRate: number | null;
  centerFrequency: number | null;
}

export function parseSigMF(json: string): SigMFMetadata {
  const meta = JSON.parse(json);
  const global = meta?.global ?? {};
  return {
    sampleRate: typeof global["core:sample_rate"] === "number"
      ? global["core:sample_rate"]
      : null,
    centerFrequency: typeof global["core:frequency"] === "number"
      ? global["core:frequency"]
      : null,
  };
}

export function findSigMFFile(
  files: File[],
  dataFileName: string,
): File | null {
  const baseName = dataFileName.replace(/\.[^.]+$/, "");
  return (
    files.find((f) => f.name === baseName + ".sigmf-meta") ?? null
  );
}
