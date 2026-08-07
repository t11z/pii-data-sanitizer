import type { Span } from '../../types';

// Local part and non-terminal domain labels allow Unicode letters (\p{L}) so
// SMTPUTF8 / EAI addresses (ä, ø, ñ, é, CJK, …) and IDN hosts written in
// Unicode form (sørensen-consulting.no, bücher.example, café-münchen.de) match
// in full instead of truncating at the first non-ASCII byte. The FINAL label
// (the TLD) stays ASCII with a 2+ letter floor — real IDN TLDs almost always
// appear in their Punycode `xn--` ASCII form on the wire, and requiring the
// last label to be ASCII letters is the precision anchor that keeps loose
// "Café.München" sentence fragments after an `@` from matching.
const EMAIL_RE =
  /[\p{L}0-9._%+-]+@[\p{L}0-9](?:[\p{L}0-9-]*[\p{L}0-9])?(?:\.[\p{L}0-9](?:[\p{L}0-9-]*[\p{L}0-9])?)*\.[a-zA-Z]{2,}/gu;

export function detectEmails(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(EMAIL_RE)) {
    const value = match[0];
    const tld = value.slice(value.lastIndexOf('.') + 1);
    if (tld.length < 2) continue;
    spans.push({
      start: match.index,
      end: match.index + value.length,
      type: 'EMAIL',
      text: value,
      confidence: 0.99,
      source: 'email',
    });
  }
  return spans;
}
