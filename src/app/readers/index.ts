// File ingestion layer: turns an uploaded File into plain text for the
// detection pipeline. Everything runs in the browser — no network, no upload —
// so the zero-knowledge promise holds. Format parsers are loaded on demand
// (dynamic import) to keep the initial bundle small.

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Reads a user-provided file and returns its text content. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.docx') || file.type === DOCX_MIME) {
    const { extractDocxText } = await import('./docx');
    return extractDocxText(await file.arrayBuffer());
  }

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { extractPdfText } = await import('./pdf');
    return extractPdfText(await file.arrayBuffer());
  }

  // .txt, .csv, .json and anything else: already plain text (UTF-8).
  return file.text();
}
