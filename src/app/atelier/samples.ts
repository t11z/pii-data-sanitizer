export type SampleKey = 'email_de' | 'logs' | 'json';

export interface SamplePreset {
  key: SampleKey;
  label: string;
  content: string;
  rehydrateHint?: string;
}

/**
 * Realistic sample documents tuned with checksum-valid test IBANs (ISO 7064
 * mod-97) and Luhn-valid test card numbers so the precision-gated core engine
 * detects every entity genuinely.
 */
export const SAMPLE_PRESETS: readonly SamplePreset[] = [
  {
    key: 'email_de',
    label: 'E-Mail (DE)',
    content: `Von: Dr. Lena Lindemann <lena.lindemann@nordwerk-gmbh.de>
An: support@cloudvault.example
Betreff: Rückerstattung & Kontodaten – Vertrag #88412

Hallo Markus Weber,

vielen Dank für das freundliche Telefonat heute. Wie besprochen sende ich Ihnen meine aktualisierten Daten für die Rückerstattung:

Name: Lena Lindemann
Geburtsdatum: 14.08.1987
Telefon: +49 171 8492031
IBAN: DE89 3704 0044 0532 0130 00
Backup-Kreditkarte: 4532-8910-4421-9872

Falls es Rückfragen gibt, erreichen Sie mich auch privat unter lena.privat87@gmail.com oder telefonisch unter 0511 9823410.

Viele Grüße,
Lena Lindemann`,
    rehydrateHint: `Sehr geehrte(r) [PERSON_1],

wir haben Ihre Rückerstattung auf das Konto [IBAN_1] veranlasst und eine Bestätigung an [EMAIL_1] gesendet.`,
  },
  {
    key: 'logs',
    label: 'Incident Logs',
    content: `[2026-11-25 19:42:11] WARN AuthService: Failed login attempt for user="sarah.connor@cyberdyne.io" from IP 84.152.19.204
[2026-11-25 19:42:14] INFO BillingWorker: Processing payout to IBAN DE44 5001 0517 5407 3249 31 (Contact: +49 30 901820)
[2026-11-25 19:42:19] ERROR StripeGateway: Request failed with key sk-live-9f8a7b6c5d4e3f2a1b0c9d8e7f
[2026-11-25 19:42:22] DEBUG WebhookProxy: Forwarding Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload123 to internal node 10.24.8.112
[2026-11-25 19:42:25] INFO SupportBot: Escalated ticket for Customer: Jonas Richter (jonas.r@finanz-plus.de)`,
  },
  {
    key: 'json',
    label: 'JSON Payload',
    content: `{
  "event": "customer.onboarding.completed",
  "timestamp": "2026-11-25",
  "customer": {
    "full_name": "Clara Hoffmann",
    "email": "clara.hoffmann@studio-berlin.de",
    "phone": "+49 152 33981204",
    "date_of_birth": "22.03.1992",
    "ip_address": "172.16.45.89"
  },
  "billing": {
    "iban": "DE27 1007 7777 0209 2997 00",
    "card_number": "5412 7534 8901 2349",
    "api_token": "ghp_9xK2mP7qR4sT8vW1yZ3aB5cD6eF"
  }
}`,
  },
];

export function getSamplePreset(key: SampleKey): SamplePreset {
  return SAMPLE_PRESETS.find((s) => s.key === key) ?? SAMPLE_PRESETS[0];
}
