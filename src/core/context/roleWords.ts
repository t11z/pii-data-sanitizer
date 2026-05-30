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
