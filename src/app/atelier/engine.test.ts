import { describe, expect, it } from 'vitest';
import { detect, normalize } from '../../core';
import { nameSourceFromSources } from '../../core/db/fromSources';
import {
  atelierKeyOf,
  buildAtelierView,
  buildAuditReport,
  detectSecrets,
  generateSmartMask,
  parseCustomRule,
  rehydrateText,
} from './engine';
import { getSamplePreset } from './samples';

const nameSource = nameSourceFromSources();

describe('detectSecrets', () => {
  // Held-out synthetic tokens verifying pattern generalization.
  it('detects Stripe-like, GitHub PAT, AWS AKIA, and Bearer tokens', () => {
    const text =
      'keys: sk-proj-AbCdEf1234567890xy, ghp_1234567890abcdefghij, AKIA1234567890ABCDEF, Bearer eyJhbGciOiJIUzI1NiJ9.payload999';
    const spans = detectSecrets(text);
    expect(spans.map((s) => s.text)).toEqual([
      'sk-proj-AbCdEf1234567890xy',
      'ghp_1234567890abcdefghij',
      'AKIA1234567890ABCDEF',
      'Bearer eyJhbGciOiJIUzI1NiJ9.payload999',
    ]);
    expect(spans.every((s) => s.type === 'SECRET')).toBe(true);
  });
});

describe('parseCustomRule', () => {
  it('parses literal words and escapes regex metacharacters', () => {
    const rule = parseCustomRule('Project Orion (v2.0)', '1');
    expect(rule).not.toBeNull();
    expect(rule?.flags).toContain('g');
    expect(rule?.flags).toContain('i');
  });

  it('parses /pattern/flags syntax and forces global flag', () => {
    const rule = parseCustomRule('/INV-\\d{4}/i', '2');
    expect(rule).not.toBeNull();
    expect(rule?.source).toBe('INV-\\d{4}');
    expect(rule?.flags).toContain('g');
    expect(rule?.flags).toContain('i');
  });

  it('returns null for blank or invalid regex syntax', () => {
    expect(parseCustomRule('   ', '3')).toBeNull();
    expect(parseCustomRule('/[unclosed/', '4')).toBeNull();
  });
});

describe('generateSmartMask', () => {
  it('masks emails, IBANs, IPs, phones, and names with format-preserving shapes', () => {
    expect(generateSmartMask('hannah@nordwerk.de', 'EMAIL')).toBe('h***h@n***.de');
    expect(generateSmartMask('DE89 3704 0044 0532 0130 00', 'IBAN')).toBe('DE89 •••• •••• 0 00');
    expect(generateSmartMask('198.51.100.42', 'IP')).toBe('198.51.•••.•••');
    expect(generateSmartMask('Hannah Berg', 'PERSON')).toBe('H••••• B•••');
  });
});

describe('buildAtelierView & redaction modes', () => {
  // Held-out input combining core PII, secrets, and a custom term.
  const raw =
    'Contact Hannah Berg at hannah@nordwerk.de or key sk-test-AbCdEf1234567890 regarding Project Vega.';
  const normalized = normalize(raw);
  const coreSpans = detect(normalized, { nameSource });
  const vegaRule = parseCustomRule('Project Vega', 'r1')!;

  it('replaces deterministically in token mode and records Vault Map hits', () => {
    const view = buildAtelierView({
      normalized,
      coreSpans,
      mode: 'token',
      secretsEnabled: true,
      customRules: [vegaRule],
      disabledKeys: new Set(),
    });

    expect(view.plainText).toContain('[PERSON_1]');
    expect(view.plainText).toContain('[EMAIL_1]');
    expect(view.plainText).toContain('[SECRET_1]');
    expect(view.plainText).toContain('[CUSTOM_1]');
    expect(view.plainText).not.toContain('Hannah Berg');
    expect(view.plainText).not.toContain('Project Vega');
    expect(view.vaultEntries.length).toBe(4);
    expect(view.exposure.score).toBeGreaterThan(0);
  });

  it('supports block, mask, and synthetic modes', () => {
    const blockView = buildAtelierView({
      normalized,
      coreSpans,
      mode: 'block',
      secretsEnabled: true,
      customRules: [vegaRule],
      disabledKeys: new Set(),
    });
    expect(blockView.plainText).toContain('██████');

    const maskView = buildAtelierView({
      normalized,
      coreSpans,
      mode: 'mask',
      secretsEnabled: true,
      customRules: [],
      disabledKeys: new Set(),
    });
    expect(maskView.plainText).toContain('h***h@n***.de');

    const synthView = buildAtelierView({
      normalized,
      coreSpans,
      mode: 'synthetic',
      secretsEnabled: true,
      customRules: [],
      disabledKeys: new Set(),
    });
    expect(synthView.plainText).toContain('alex.vogel@example.invalid');
    expect(synthView.plainText).not.toContain('hannah@nordwerk.de');
  });

  it('keeps disabled false-positive entries as original and lists them in removedEntries', () => {
    const view = buildAtelierView({
      normalized,
      coreSpans,
      mode: 'token',
      secretsEnabled: true,
      customRules: [],
      disabledKeys: new Set([atelierKeyOf('EMAIL', 'hannah@nordwerk.de')]),
    });

    expect(view.plainText).toContain('hannah@nordwerk.de');
    expect(view.removedEntries.some((r) => r.original === 'hannah@nordwerk.de')).toBe(true);
  });
});

describe('rehydrateText', () => {
  it('restores tokens locally and prevents prefix collisions like [EMAIL_1] vs [EMAIL_10]', () => {
    const entries = [
      {
        replacement: '[EMAIL_1]',
        original: 'first@example.org',
        type: 'EMAIL' as const,
        label: 'E-Mail',
        tokenPrefix: 'EMAIL',
        pillClass: '',
        count: 1,
        key: 'EMAIL:first@example.org',
        isCustom: false,
      },
      {
        replacement: '[EMAIL_10]',
        original: 'tenth@example.org',
        type: 'EMAIL' as const,
        label: 'E-Mail',
        tokenPrefix: 'EMAIL',
        pillClass: '',
        count: 1,
        key: 'EMAIL:tenth@example.org',
        isCustom: false,
      },
    ];
    const res = rehydrateText('Send to [EMAIL_10] and CC [EMAIL_1].', entries);
    expect(res.text).toBe('Send to tenth@example.org and CC first@example.org.');
    expect(res.restoredCount).toBe(2);
  });
});

describe('buildAuditReport', () => {
  it('contains strictly metadata and zero raw PII strings', () => {
    const text = 'Mail hannah@nordwerk.de with IBAN DE89 3704 0044 0532 0130 00';
    const normalized = normalize(text);
    const view = buildAtelierView({
      normalized,
      coreSpans: detect(normalized, { nameSource }),
      mode: 'token',
      secretsEnabled: true,
      customRules: [],
      disabledKeys: new Set(),
    });
    const report = buildAuditReport(view, 'token', '2026-11-25T12:00:00.000Z');
    const serialized = JSON.stringify(report);
    expect(report.zeroKnowledgeVerified).toBe(true);
    expect(report.totalEntitiesRedacted).toBe(2);
    expect(serialized).not.toContain('hannah@nordwerk.de');
    expect(serialized).not.toContain('DE89');
  });
});

describe('sample presets integrate cleanly with core engine', () => {
  it('detects IBAN, credit card, email, phone, DOB, and names in email_de preset', () => {
    const preset = getSamplePreset('email_de');
    const normalized = normalize(preset.content);
    const view = buildAtelierView({
      normalized,
      coreSpans: detect(normalized, { nameSource }),
      mode: 'token',
      secretsEnabled: true,
      customRules: [],
      disabledKeys: new Set(),
    });
    expect(view.categoryCounts.IBAN).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.CREDIT_CARD).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.EMAIL).toBeGreaterThanOrEqual(2);
    expect(view.categoryCounts.PHONE).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.DATE_OF_BIRTH).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.PERSON).toBeGreaterThanOrEqual(1);
  });

  it('detects secrets, IPs, emails, and IBAN in logs preset', () => {
    const preset = getSamplePreset('logs');
    const normalized = normalize(preset.content);
    const view = buildAtelierView({
      normalized,
      coreSpans: detect(normalized, { nameSource }),
      mode: 'token',
      secretsEnabled: true,
      customRules: [],
      disabledKeys: new Set(),
    });
    expect(view.categoryCounts.SECRET).toBeGreaterThanOrEqual(2);
    expect(view.categoryCounts.IP).toBeGreaterThanOrEqual(2);
    expect(view.categoryCounts.IBAN).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.EMAIL).toBeGreaterThanOrEqual(2);
  });

  it('detects IBAN, credit card, secret, email, phone, and IP in json preset', () => {
    const preset = getSamplePreset('json');
    const normalized = normalize(preset.content);
    const view = buildAtelierView({
      normalized,
      coreSpans: detect(normalized, { nameSource }),
      mode: 'token',
      secretsEnabled: true,
      customRules: [],
      disabledKeys: new Set(),
    });
    expect(view.categoryCounts.IBAN).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.CREDIT_CARD).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.SECRET).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.EMAIL).toBeGreaterThanOrEqual(1);
    expect(view.categoryCounts.IP).toBeGreaterThanOrEqual(1);
  });
});
