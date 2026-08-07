import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Extracts text from a PDF file buffer using pdf.js, entirely client-side. */
export async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Same-origin, bundled worker — never a CDN, so nothing leaves the device.
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // pdfjs-dist v6 moved destroy() from the resolved PDFDocumentProxy onto the
  // loading task itself, so the task handle must be kept around for cleanup.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // WASM is only used for image decoding, which text extraction never does.
    // Disabling it keeps the strict CSP (script-src 'self', no wasm-unsafe-eval).
    useWasm: false,
  });
  const doc = await loadingTask.promise;

  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items));
    }
    return pages.join('\n\n').trim();
  } finally {
    await loadingTask.destroy();
  }
}

// items is Array<TextItem | TextMarkedContent>; only TextItem carries text.
function itemsToText(items: ReadonlyArray<unknown>): string {
  let out = '';
  for (const item of items) {
    const it = item as { str?: unknown; hasEOL?: unknown };
    if (typeof it.str === 'string') out += it.str;
    if (it.hasEOL === true) out += '\n';
  }
  return out;
}
