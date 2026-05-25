import { unzipSync, strFromU8 } from 'fflate';

/** Extracts visible text from a .docx (OOXML) file buffer. */
export function extractDocxText(buf: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buf));
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('Not a valid .docx file (missing word/document.xml).');
  return xmlToText(strFromU8(doc));
}

// OOXML keeps visible text in flat <w:t> runs grouped into <w:p> paragraphs.
// We pull text out without a DOM parser so the same code runs in the browser
// and under the Node-based test runner.
function xmlToText(xml: string): string {
  const lines = xml.split(/<\/w:p>/).map(paragraphText);
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Walk a paragraph's markup in document order so inline tabs/breaks (which are
// siblings of the <w:t> text runs, not nested inside them) land in the output.
function paragraphText(p: string): string {
  let out = '';
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:(?:br|cr)\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    if (m[1] !== undefined) out += decodeXmlEntities(m[1]);
    else if (m[0].startsWith('<w:tab')) out += '\t';
    else out += '\n';
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}
