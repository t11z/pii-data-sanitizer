/**
 * Appositive role nouns that strongly introduce a following person name in
 * business / support prose ("Account holder Meera Chatterjee", "Engineer Amir
 * al-Rashid", "Merchant Pradeep Kumar-Singh", "Kundin Anna Schmidt"). They let the
 * name detector start a span on *context* even when the name is not in the
 * database — the heuristic that generalizes beyond the dictionary.
 *
 * Entries are grouped by language (like `titles.ts` / `particles.ts`), so adding a
 * language is a data change. Stored lowercased and matched case-insensitively —
 * German nouns are capitalized in prose, but the lookup lowercases first.
 *
 * To keep precision, a role cue only yields a PERSON when it is followed by a
 * multi-token candidate (see scoring: roleBefore credited with parts >= 2) and no
 * part is a NON_NAME_WORD, so "Customer Service", "Account Approval Form",
 * "Kundenservice Team" etc. do not fire.
 */
export const ROLE_WORDS = new Set<string>([
  // --- English ---
  // account / commerce
  'customer',
  'client',
  'cardholder',
  'holder',
  'accountholder',
  'merchant',
  'buyer',
  'seller',
  'vendor',
  'supplier',
  'payee',
  'payer',
  // support / engineering roles
  'engineer',
  'technician',
  'developer',
  'administrator',
  'agent',
  'representative',
  'operator',
  'analyst',
  'specialist',
  'consultant',
  'contractor',
  'supervisor',
  'dispatcher',
  // people in a process / case
  'applicant',
  'patient',
  'recipient',
  'sender',
  'caller',
  'requester',
  'requestor',
  'assignee',
  'reporter',
  'claimant',
  'beneficiary',
  'nominee',
  'signatory',
  'witness',
  'tenant',
  'landlord',
  'passenger',
  'attendee',
  'guest',
  'member',
  'owner',
  'partner',
  'colleague',
  'candidate',
  'employee',
  'contact',
  'guardian',
  // --- German --- (capitalized in prose; lookup lowercases. Feminine -in forms
  // are listed separately because they are distinct surface tokens.)
  'kunde',
  'kundin',
  'mandant',
  'mandantin',
  'antragsteller',
  'antragstellerin',
  'sachbearbeiter',
  'sachbearbeiterin',
  'mitarbeiter',
  'mitarbeiterin',
  'ansprechpartner',
  'betreuer',
  'techniker',
  'ingenieur',
  'entwickler',
  'berater',
  'lieferant',
  'händler',
  'verkäufer',
  'käufer',
  'empfänger',
  'absender',
  'anrufer',
  'zeuge',
  'zeugin',
  'mieter',
  'vermieter',
  'eigentümer',
  'inhaber',
  'kontoinhaber',
  'karteninhaber',
  'begünstigter',
  'bewerber',
  'kollege',
  'kollegin',
]);

/**
 * Structural / business nouns that must NOT be accepted as a name part on the
 * unknown-capitalization (title/role) path, so capitalized phrases like "Customer
 * Service Team", "Account Approval Form" or "Kundenservice Abteilung" are not
 * mistaken for people. Grouped by language; stored lowercased.
 */
export const NON_NAME_WORDS = new Set<string>([
  // --- English ---
  'service',
  'services',
  'team',
  'department',
  'dept',
  'support',
  'care',
  'center',
  'centre',
  'desk',
  'group',
  'division',
  'unit',
  'account',
  'approval',
  'confirmation',
  'form',
  'review',
  'request',
  'ticket',
  'case',
  'report',
  'invoice',
  'payment',
  'refund',
  'order',
  'agreement',
  'contract',
  'policy',
  'portal',
  'system',
  'platform',
  'dashboard',
  'notification',
  'escalation',
  'priority',
  'status',
  'update',
  'summary',
  'reference',
  'manual',
  'guide',
  'document',
  'attachment',
  'schedule',
  'meeting',
  'project',
  'product',
  'feature',
  'version',
  'release',
  'server',
  'database',
  'network',
  'application',
  'module',
  'license',
  'subscription',
  'balance',
  'transaction',
  'statement',
  'receipt',
  // --- German --- (German compounds most multi-word structures into a single
  // token, so these mainly guard the handoff/role path against the common
  // standalone ticket nouns that can follow a cue.)
  'abteilung',
  'fachabteilung',
  'kundenservice',
  'kundendienst',
  'dienst',
  'vertrieb',
  'buchhaltung',
  'zentrale',
  'hotline',
  'geschäftsstelle',
  'niederlassung',
  'filiale',
  'reklamation',
  'beschwerde',
  'postfach',
  'leitung',
  'bereich',
  'gruppe',
  'stelle',
  'anfrage',
  'vorgang',
  'rechnung',
  'auftrag',
  'bestellung',
  'mahnung',
  'antrag',
  'konto',
  'nummer',
]);

/**
 * Abbreviated professional-role prefixes written with a trailing period in prose
 * ("Eng. Dimitri Petrov"). They behave like role cues but the period is intrinsic
 * to the abbreviation, so the name detector tolerates that period in the gap (see
 * the abbreviation branch in nameStart). Kept SEPARATE from ROLE_WORDS on purpose:
 * a full role word followed by a period is a sentence boundary ("...notified the
 * engineer. Bob arrived."), which must NOT start a name — only genuine
 * abbreviations get the dot tolerance. Stored lowercased, without the dot.
 */
export const ROLE_ABBREVIATIONS = new Set<string>(['eng']);

/**
 * Past-tense / participle ticket-routing verbs that take a person as their object
 * via a connector preposition: EN "Escalated to Göran Andström", "forwarded to
 * Rajesh Iyer"; DE "Eskaliert an Anna Schmidt", "Weitergeleitet an Rajesh Iyer".
 * Recognized as a *two-token* role cue (verb + connector) in nameStart, so the
 * candidate name two tokens after the verb gets the same roleBefore boost as the
 * role nouns above.
 *
 * Each frame pairs a CLOSED verb set with the connector preposition(s) of THAT
 * language, and the pairing is load-bearing, not cosmetic: English "an" is the
 * indefinite article ("delegated an Urgent Ticket"), while German "an" is the
 * recipient marker ("eskaliert an …"). Unioning verbs and connectors across
 * languages would let "delegated an Urgent Ticket" mis-fire — so isHandoffFrame
 * requires verb and connector from the *same* entry. The closed verb set is
 * likewise deliberate: a general "verb + preposition" rule would catch
 * imperative/structural frames like EN "Reset to Default Settings" or DE "zurück
 * an Absender". Stored lowercased.
 *
 * Frame shape is participle-first (verb, connector, name) — the telegraphic style
 * of ticket logs ("Eskaliert an …"). German verb-final clauses ("… wurde an X
 * weitergeleitet", participle after the name) are NOT covered, mirroring the
 * English limitation that only "verb to Name", not "Name was the recipient", fires.
 */
interface HandoffFrame {
  /** Past-tense / participle routing verbs, lowercased. */
  verbs: Set<string>;
  /** Connector preposition(s) for this language, lowercased. */
  connectors: Set<string>;
}

/**
 * Source-noun frames: "<noun> <connector> <Name>" — origin-of-message cues that
 * also sit two tokens before the name, parallel to HANDOFF_FRAMES. Ubiquitous in
 * support, email, and news prose ("Complaint from Sven Larsson", "Email from
 * Anna Schmidt", "Bericht von Hans Müller"). Without this lookback an unknown
 * given name like "Sven" (no DB hit, no title, no role noun before it) can't
 * start a chain even when a strong source noun introduces it — the name is
 * missed even though the cue is unambiguous.
 *
 * Same closed, language-paired shape as HANDOFF_FRAMES: an English noun pairs
 * only with "from", a German noun pairs only with "von", so a cross-language
 * mix ("update von …" / "Anfrage from …") never fires. The closed noun set is
 * deliberate: a generic "any noun + from" rule would catch geographic /
 * temporal frames like "Letter from London arrived" or "Update from yesterday's
 * meeting" where the capitalized follower is a place or label, not a person.
 *
 * Precision relies on the existing layers: single-token candidates after the
 * cue still fall under the parts === 1 + extOnly penalty in scoreName, so a
 * lone city / weekday / brand after "from" never promotes; structural follow-on
 * tokens (NON_NAME_WORDS) still break the chain. The cue only earns its scoring
 * bonus when parts >= 2 (see scoreName), matching the handoff frame's contract.
 * Stored lowercased.
 */
export interface SourceFrame {
  /** Source-of-message nouns, lowercased. */
  nouns: Set<string>;
  /** Connector preposition(s) for this language, lowercased. */
  connectors: Set<string>;
}

export const SOURCE_FRAMES: SourceFrame[] = [
  {
    // English: "<noun> from <Person>". Closed set of message / contact-origin
    // nouns. "by" is intentionally excluded — passive-agent "by" already has
    // wide coverage via the existing title / DB-anchored paths and a "by"-cue
    // would over-trigger on causal frames ("report by region", "filed by
    // department").
    nouns: new Set([
      'complaint',
      'inquiry',
      'enquiry',
      'request',
      'message',
      'email',
      'mail',
      'letter',
      'note',
      'notes',
      'call',
      'report',
      'submission',
      'feedback',
      'response',
      'reply',
      'query',
      'update',
      'notice',
      'notification',
    ]),
    connectors: new Set(['from']),
  },
  {
    // German: "<Substantiv> von <Person>". Closed set of message-origin nouns
    // pairing only with the German "von" (the English noun + German "von" or
    // vice versa never fires — same rule as HANDOFF_FRAMES). "Mail" is left
    // out on purpose: it is an ext-tier dictionary hit and the pre-existing
    // particle path on a sentence-initial ext token + "von" already extends
    // the chain into the surname ("Mail von …" gets detected without help
    // from this frame), so adding it here would only re-anchor a path already
    // covered upstream.
    nouns: new Set([
      'beschwerde',
      'anfrage',
      'nachricht',
      'email',
      'brief',
      'notiz',
      'anruf',
      'bericht',
      'rückmeldung',
      'antwort',
      'mitteilung',
      'meldung',
      'feedback',
    ]),
    connectors: new Set(['von']),
  },
];

export const HANDOFF_FRAMES: HandoffFrame[] = [
  {
    // English
    verbs: new Set([
      'escalated',
      'forwarded',
      'routed',
      'transferred',
      'reassigned',
      'redirected',
      'assigned',
      'referred',
      'handed',
      'delegated',
    ]),
    connectors: new Set(['to']),
  },
  {
    // German — recipient marker is "an" (locative/temporal "zu" is excluded on
    // purpose: "an [Person]" is the dative recipient, "zu" is not used to hand a
    // case to someone).
    verbs: new Set([
      'eskaliert',
      'weitergeleitet',
      'weitergegeben',
      'übergeben',
      'zugewiesen',
      'umgeleitet',
      'weitergereicht',
      'delegiert',
      'verwiesen',
      'überwiesen',
    ]),
    connectors: new Set(['an']),
  },
];

export function isRoleWord(token: string): boolean {
  const l = token.toLowerCase();
  return ROLE_WORDS.has(l) || ROLE_ABBREVIATIONS.has(l);
}

export function isRoleAbbreviation(token: string): boolean {
  return ROLE_ABBREVIATIONS.has(token.toLowerCase());
}

export function isNonNameWord(token: string): boolean {
  return NON_NAME_WORDS.has(token.toLowerCase());
}

/**
 * True when `verb` + `connector` form a handoff frame in the SAME language (see
 * HANDOFF_FRAMES) — e.g. ("escalated", "to") or ("eskaliert", "an"), but never the
 * cross-language mix ("escalated", "an") where "an" is just the English article.
 */
export function isHandoffFrame(verb: string, connector: string): boolean {
  const v = verb.toLowerCase();
  const c = connector.toLowerCase();
  return HANDOFF_FRAMES.some((f) => f.verbs.has(v) && f.connectors.has(c));
}

/**
 * True when `noun` + `connector` form a source frame in the SAME language (see
 * SOURCE_FRAMES) — e.g. ("complaint", "from") or ("Beschwerde", "von"), but
 * never the cross-language mix ("complaint", "von") / ("Beschwerde", "from").
 */
export function isSourceFrame(noun: string, connector: string): boolean {
  const n = noun.toLowerCase();
  const c = connector.toLowerCase();
  return SOURCE_FRAMES.some((f) => f.nouns.has(n) && f.connectors.has(c));
}
