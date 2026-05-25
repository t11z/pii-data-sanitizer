import type { Span } from '../../types';

// Local part allows Unicode letters (\p{L}) so SMTPUTF8 / EAI addresses with
// non-ASCII names (ä, ø, ñ, é, CJK, …) match in full instead of truncating at
// the first non-ASCII byte. The domain stays ASCII; the \.tld anchor guards precision.
const EMAIL_RE =
  /[\p{L}0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+/gu;

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
