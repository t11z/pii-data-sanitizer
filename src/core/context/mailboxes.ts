/**
 * Functional / role mailbox local-parts that do not denote a person. When an
 * email's local part (whole or any dot/underscore/hyphen segment) is one of
 * these, no name is derived from it — so "info@", "support.team@", "noreply@"
 * never seed a PERSON. Stored lowercased.
 */
export const FUNCTIONAL_MAILBOXES = new Set<string>([
  'info',
  'support',
  'noreply',
  'no-reply',
  'donotreply',
  'sales',
  'admin',
  'contact',
  'hello',
  'team',
  'office',
  'help',
  'helpdesk',
  'service',
  'services',
  'billing',
  'accounts',
  'accounting',
  'hr',
  'jobs',
  'careers',
  'recruiting',
  'marketing',
  'press',
  'media',
  'abuse',
  'postmaster',
  'webmaster',
  'hostmaster',
  'mailer-daemon',
  'mail',
  'mailbox',
  'newsletter',
  'notifications',
  'notification',
  'alerts',
  'security',
  'privacy',
  'legal',
  'compliance',
  'finance',
  'orders',
  'order',
  'enquiries',
  'inquiries',
  'feedback',
  'subscribe',
  'unsubscribe',
  'root',
  'daemon',
  'test',
  'demo',
]);

export function isFunctionalMailbox(segment: string): boolean {
  return FUNCTIONAL_MAILBOXES.has(segment);
}
