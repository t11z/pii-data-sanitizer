import type { Identity, MappingEntry, PiiType, Span } from '../types';
import { isParticle } from '../context/particles';

const SEP = /[._-]+/;
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');
const STRUCTURED: ReadonlySet<PiiType> = new Set<PiiType>(['PHONE', 'IBAN', 'IP', 'CREDIT_CARD']);

/**
 * Canonical name form for linking. Expands German umlauts to their ASCII digraph
 * (ü→ue, ß→ss) BEFORE stripping diacritics, so a name written "Müller" lines up
 * with the "mueller" that appears in an email local part — the common case that a
 * plain diacritic fold ("muller") would miss. Other accents fold away normally.
 */
function normName(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(COMBINING, '');
}

/** Canonical, lowercased name tokens of length >= 3 (particles dropped). */
function personTokens(name: string): string[] {
  return name
    .split(/\s+/)
    .map((t) => normName(t.replace(/[^\p{L}\p{N}-]/gu, '')))
    .flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]))
    .filter((t) => t.length >= 3 && !isParticle(t));
}

function localPartOf(email: string): string {
  const at = email.indexOf('@');
  return at >= 0 ? email.slice(0, at) : email;
}

/** How many person tokens the email's local part carries (segment- or suffix-match). */
function emailMatchScore(localPart: string, tokens: string[]): number {
  const segments = normName(localPart).split(SEP).filter(Boolean);
  let matched = 0;
  for (const tok of tokens) {
    const hit = segments.some(
      (seg) => seg === tok || (seg.endsWith(tok) && seg.length - tok.length <= 2)
    );
    if (hit) matched++;
  }
  return matched;
}

function lineOf(text: string, pos: number): number {
  let n = 0;
  for (let i = 0; i < pos && i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

interface Draft {
  label: string;
  placeholders: string[];
  tokens: string[];
  lines: Set<number>;
}

/**
 * Groups detected attributes into identities. A person anchors an identity; an
 * email joins the person whose name its local part carries (else forms its own
 * group); phone/IBAN/IP/card numbers attach to a multi-attribute identity on the
 * same line. Only multi-attribute groups are emitted — a lone name or email is
 * left ungrouped. Placeholders stay distinct; this only adds grouping metadata,
 * so it is meaningful in pseudonymize mode (where placeholders are unique).
 */
export function resolveIdentities(
  spans: Span[],
  mapping: MappingEntry[],
  text: string
): { mapping: MappingEntry[]; identities: Identity[] } {
  const linesFor = (type: PiiType, value: string): Set<number> =>
    new Set(
      spans
        .filter((s) => s.type === type && s.text.toLowerCase() === value.toLowerCase())
        .map((s) => lineOf(text, s.start))
    );

  const drafts: Draft[] = [];

  for (const p of mapping.filter((m) => m.type === 'PERSON')) {
    drafts.push({
      label: p.original,
      placeholders: [p.placeholder],
      tokens: personTokens(p.original),
      lines: linesFor('PERSON', p.original),
    });
  }

  for (const e of mapping.filter((m) => m.type === 'EMAIL')) {
    const localPart = localPartOf(e.original);
    let best: Draft | null = null;
    let bestScore = 0;
    for (const d of drafts) {
      if (d.tokens.length === 0) continue;
      const score = emailMatchScore(localPart, d.tokens);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    const lines = linesFor('EMAIL', e.original);
    if (best && bestScore > 0) {
      best.placeholders.push(e.placeholder);
      lines.forEach((l) => best!.lines.add(l));
    } else {
      drafts.push({ label: localPart, placeholders: [e.placeholder], tokens: [], lines });
    }
  }

  for (const m of mapping.filter((e) => STRUCTURED.has(e.type))) {
    const lines = linesFor(m.type, m.original);
    const target = drafts.find(
      (d) => d.placeholders.length >= 2 && [...lines].some((l) => d.lines.has(l))
    );
    if (target) target.placeholders.push(m.placeholder);
  }

  const identities: Identity[] = drafts
    .filter((d) => d.placeholders.length >= 2)
    .map((d, i) => ({ id: i + 1, label: d.label, placeholders: d.placeholders }));

  const identityOf = new Map<string, number>();
  for (const idn of identities) for (const ph of idn.placeholders) identityOf.set(ph, idn.id);

  const stamped = mapping.map((m) => {
    const id = identityOf.get(m.placeholder);
    return id ? { ...m, identityId: id } : m;
  });

  return { mapping: stamped, identities };
}
