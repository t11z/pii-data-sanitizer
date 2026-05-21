/**
 * Normalizes text to Unicode NFC so that detection and sanitization operate on a
 * single canonical form. All span offsets in this engine are relative to the
 * normalized string returned here, never to the caller's original input.
 */
export function normalize(text: string): string {
  return text.normalize('NFC');
}
