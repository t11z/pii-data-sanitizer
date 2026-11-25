import type { PiiType } from '../../core';

export type AtelierEntityType = PiiType | 'SECRET' | 'CUSTOM';

export type ToggleableEntityType = Exclude<AtelierEntityType, 'CUSTOM'>;

export type AtelierRedactionMode = 'token' | 'block' | 'mask' | 'synthetic';

export type OutputLens = 'sanitized' | 'classified' | 'vault' | 'rehydrate';

export type RiskLevel = 'clean' | 'moderate' | 'elevated' | 'critical';

export interface CustomRule {
  id: string;
  raw: string;
  source: string;
  flags: string;
}

export interface AtelierSpan {
  start: number;
  end: number;
  type: AtelierEntityType;
  text: string;
  confidence: number;
  source: string;
}

export interface EntityMeta {
  id: AtelierEntityType;
  label: string;
  tokenPrefix: string;
  severity: number;
  pillClass: string;
  dotClass: string;
  fakePool: readonly string[];
}

export interface VaultEntry {
  replacement: string;
  original: string;
  type: AtelierEntityType;
  label: string;
  tokenPrefix: string;
  pillClass: string;
  count: number;
  key: string;
  isCustom: boolean;
}

export interface RemovedEntity {
  key: string;
  type: AtelierEntityType;
  original: string;
  label: string;
}

export type OutputSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'entity';
      original: string;
      replacement: string;
      type: AtelierEntityType;
      label: string;
      tokenPrefix: string;
      pillClass: string;
      source: string;
    };

export interface ExposureAssessment {
  score: number;
  level: RiskLevel;
  badgeLabel: string;
  summary: string;
  ringColor: string;
  ambientColor: string;
  badgeClass: string;
}

export interface AtelierView {
  plainText: string;
  segments: OutputSegment[];
  vaultEntries: VaultEntry[];
  removedEntries: RemovedEntity[];
  activeSpans: AtelierSpan[];
  categoryCounts: Record<AtelierEntityType, number>;
  totalDetections: number;
  exposure: ExposureAssessment;
}

export interface AuditReport {
  tool: string;
  timestamp: string;
  redactionMode: AtelierRedactionMode;
  zeroKnowledgeVerified: true;
  totalEntitiesRedacted: number;
  uniqueEntitiesInVault: number;
  exposureScore: number;
  exposureLevel: RiskLevel;
  breakdownByCategory: Partial<Record<AtelierEntityType, number>>;
}

export type ToastVariant = 'success' | 'info' | 'danger';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
}

/** Ordered list of toggleable entity categories shown as filter chips. */
export const TOGGLEABLE_ENTITY_TYPES: readonly ToggleableEntityType[] = [
  'SECRET',
  'IBAN',
  'CREDIT_CARD',
  'NATIONAL_ID',
  'PASSPORT',
  'EMAIL',
  'PHONE',
  'IP',
  'MAC',
  'DATE_OF_BIRTH',
  'PERSON',
];

export const ENTITY_META: Record<AtelierEntityType, EntityMeta> = {
  SECRET: {
    id: 'SECRET',
    label: 'Secrets / Keys',
    tokenPrefix: 'SECRET',
    severity: 35,
    pillClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-500',
    fakePool: ['sk-demo-0000000000000000', 'ghp_DemoTokenPlaceholder99', 'AKIAIOSFODNN7EXAMPLE'],
  },
  IBAN: {
    id: 'IBAN',
    label: 'IBAN / Bank',
    tokenPrefix: 'IBAN',
    severity: 30,
    pillClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    dotClass: 'bg-amber-500',
    fakePool: ['DE00 1234 5678 9012 3456 78', 'DE00 9876 5432 1098 7654 32'],
  },
  CREDIT_CARD: {
    id: 'CREDIT_CARD',
    label: 'Credit Card',
    tokenPrefix: 'CARD',
    severity: 30,
    pillClass: 'bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30',
    dotClass: 'bg-orange-500',
    fakePool: ['4000-0000-0000-0002', '5100-0000-0000-0008'],
  },
  NATIONAL_ID: {
    id: 'NATIONAL_ID',
    label: 'National ID',
    tokenPrefix: 'NAT_ID',
    severity: 30,
    pillClass: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
    dotClass: 'bg-red-500',
    fakePool: ['000-00-0000', '12 345 678 901'],
  },
  PASSPORT: {
    id: 'PASSPORT',
    label: 'Passport',
    tokenPrefix: 'PASSPORT',
    severity: 25,
    pillClass: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
    dotClass: 'bg-pink-500',
    fakePool: ['C01X00T47', 'X00000000'],
  },
  EMAIL: {
    id: 'EMAIL',
    label: 'E-Mail',
    tokenPrefix: 'EMAIL',
    severity: 15,
    pillClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
    dotClass: 'bg-sky-500',
    fakePool: ['alex.vogel@example.invalid', 'sam.berger@demo.invalid', 'chris.weber@test.invalid'],
  },
  PHONE: {
    id: 'PHONE',
    label: 'Phone',
    tokenPrefix: 'PHONE',
    severity: 15,
    pillClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
    dotClass: 'bg-violet-500',
    fakePool: ['+49 30 5550192', '+49 170 5550148', '+1 555-019-2834'],
  },
  IP: {
    id: 'IP',
    label: 'IP Address',
    tokenPrefix: 'IP',
    severity: 12,
    pillClass: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/30',
    dotClass: 'bg-cyan-500',
    fakePool: ['192.0.2.14', '198.51.100.42', '203.0.113.7'],
  },
  MAC: {
    id: 'MAC',
    label: 'MAC Address',
    tokenPrefix: 'MAC',
    severity: 12,
    pillClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    dotClass: 'bg-indigo-500',
    fakePool: ['02:00:00:00:00:01', '02:00:00:00:00:02'],
  },
  DATE_OF_BIRTH: {
    id: 'DATE_OF_BIRTH',
    label: 'Dates / DOB',
    tokenPrefix: 'DOB',
    severity: 10,
    pillClass: 'bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/30',
    dotClass: 'bg-teal-500',
    fakePool: ['1990-01-01', '01.01.1990', '2000-06-15'],
  },
  PERSON: {
    id: 'PERSON',
    label: 'Names',
    tokenPrefix: 'PERSON',
    severity: 14,
    pillClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
    dotClass: 'bg-emerald-500',
    fakePool: ['Jordan Richter', 'Taylor Lindner', 'Morgan Krause', 'Casey Brandt'],
  },
  CUSTOM: {
    id: 'CUSTOM',
    label: 'Custom Rule',
    tokenPrefix: 'CUSTOM',
    severity: 20,
    pillClass: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
    dotClass: 'bg-fuchsia-500',
    fakePool: ['[REDACTED_TERM]'],
  },
};

export const MODE_LABELS: Record<AtelierRedactionMode, string> = {
  token: 'Mode: Semantic Tokens',
  block: 'Mode: Vault Redaction Blocks',
  mask: 'Mode: Smart Partial Mask',
  synthetic: 'Mode: Synthetic Drop-in Data',
};
