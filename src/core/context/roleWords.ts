/**
 * Appositive role nouns that strongly introduce a following person name in
 * business / support prose ("Account holder Meera Chatterjee", "Engineer Amir
 * al-Rashid", "Merchant Pradeep Kumar-Singh"). They let the name detector start a
 * span on *context* even when the name is not in the database — the heuristic that
 * generalizes beyond the dictionary. Stored lowercased.
 *
 * To keep precision, a role cue only yields a PERSON when it is followed by a
 * multi-token candidate (see scoring: roleBefore credited with parts >= 2) and no
 * part is a NON_NAME_WORD, so "Customer Service", "Account Approval Form" etc. do
 * not fire.
 */
export const ROLE_WORDS = new Set<string>([
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
]);

/**
 * Structural / business nouns that must NOT be accepted as a name part on the
 * unknown-capitalization (title/role) path, so capitalized phrases like "Customer
 * Service Team" or "Account Approval Form" are not mistaken for people. Stored
 * lowercased.
 */
export const NON_NAME_WORDS = new Set<string>([
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
]);

export function isRoleWord(token: string): boolean {
  return ROLE_WORDS.has(token.toLowerCase());
}

export function isNonNameWord(token: string): boolean {
  return NON_NAME_WORDS.has(token.toLowerCase());
}
