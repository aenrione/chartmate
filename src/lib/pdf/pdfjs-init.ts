import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker once at module load time.
// Vite resolves the worker URL at build time via import.meta.url.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

export {pdfjsLib};
