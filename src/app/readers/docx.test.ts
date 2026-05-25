import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractDocxText } from './docx';

function makeDocx(documentXml: string): ArrayBuffer {
  const zipped = zipSync({ 'word/document.xml': strToU8(documentXml) });
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
}

const para = (...runs: string[]) =>
  `<w:p>${runs.map((r) => `<w:r><w:t>${r}</w:t></w:r>`).join('')}</w:p>`;

describe('extractDocxText', () => {
  it('joins runs within a paragraph and separates paragraphs by newline', () => {
    const xml = `<w:document><w:body>${para('Hello ', 'world')}${para('Second line')}</w:body></w:document>`;
    expect(extractDocxText(makeDocx(xml))).toBe('Hello world\nSecond line');
  });

  it('decodes XML entities', () => {
    const xml = `<w:document><w:body>${para('a &amp; b &lt;c&gt; &#65;')}</w:body></w:document>`;
    expect(extractDocxText(makeDocx(xml))).toBe('a & b <c> A');
  });

  it('handles tab and break elements and xml:space attributes', () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t xml:space="preserve">a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p></w:body></w:document>`;
    expect(extractDocxText(makeDocx(xml))).toBe('a\tb\nc');
  });

  it('throws on a zip without word/document.xml', () => {
    const zipped = zipSync({ 'foo.txt': strToU8('nope') });
    const buf = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
    expect(() => extractDocxText(buf)).toThrow(/document\.xml/);
  });

  it('preserves PII text so the detection pipeline can see it', () => {
    const xml = `<w:document><w:body>${para('Contact ', 'jane.doe@example.com')}</w:body></w:document>`;
    expect(extractDocxText(makeDocx(xml))).toContain('jane.doe@example.com');
  });
});
