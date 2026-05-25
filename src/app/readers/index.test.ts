import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractText } from './index';

describe('extractText dispatch', () => {
  it('reads .txt as plain text', async () => {
    const file = new File(['Email me at jane.doe@example.com'], 'note.txt', { type: 'text/plain' });
    expect(await extractText(file)).toBe('Email me at jane.doe@example.com');
  });

  it('passes .csv and .json through unchanged', async () => {
    const csv = new File(['name,email\nJane,jane@example.com'], 'data.csv', { type: 'text/csv' });
    expect(await extractText(csv)).toContain('jane@example.com');
    const json = new File(['{"email":"jane@example.com"}'], 'data.json', {
      type: 'application/json',
    });
    expect(await extractText(json)).toContain('jane@example.com');
  });

  it('extracts text from a .docx by extension', async () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Contact jane.doe@example.com</w:t></w:r></w:p></w:body></w:document>';
    const zipped = zipSync({ 'word/document.xml': strToU8(xml) });
    const file = new File([zipped as Uint8Array<ArrayBuffer>], 'resume.docx');
    expect(await extractText(file)).toBe('Contact jane.doe@example.com');
  });
});
