# Spectrum Viewer

Browser-based IQ spectrogram viewer.

***Warning***: vibe-coded. I didn't write this and I haven't read it either.

Supports `.fc32`, `.sc16`, and SigMF metadata files. Drop a file on the page to view it.

## Usage

Open the [hosted version](https://iank.github.io/spectrum-viewer/) or serve `dist/index.html` from any static server.

## Development

```
nix develop
npm install
npm run dev
npm run build
npx playwright test
```
