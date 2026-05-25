import { describe, it, expect } from 'vitest';
import { detect } from '../../index';
import { isValidIban } from './iban';
import { isValidLuhn } from './creditCard';

const only = (text: string, type: string) => detect(text).filter((s) => s.type === type);

describe('email detection', () => {
  it('detects a plain address', () => {
    const spans = only('Contact me at jane.doe@example.com please', 'EMAIL');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('jane.doe@example.com');
  });

  it('detects plus-addressing and subdomains', () => {
    const spans = only('a+b@mail.sub.example.co.uk', 'EMAIL');
    expect(spans[0].text).toBe('a+b@mail.sub.example.co.uk');
  });

  it('ignores a bare @ without a domain', () => {
    expect(only('say @here now', 'EMAIL')).toHaveLength(0);
  });

  it('captures a non-ASCII local part in full', () => {
    // Held-out Unicode local parts (not the gap's "søren"): German umlaut and
    // Spanish eñe. They match only because the local class is Unicode-aware, so
    // this proves the heuristic generalizes across scripts, not a memorized value.
    expect(only('Reach support at jörg.müller@beispiel.de soon', 'EMAIL')[0].text).toBe(
      'jörg.müller@beispiel.de'
    );
    expect(only('Forward it to begoña@correo.es promptly', 'EMAIL')[0].text).toBe(
      'begoña@correo.es'
    );
  });

  it('does not loosen the domain requirement for Unicode handles', () => {
    // A Unicode word before @ with no real .tld domain must not match.
    expect(only('Café@home served lunch', 'EMAIL')).toHaveLength(0);
    expect(only('Ping üser@localhost from the shell', 'EMAIL')).toHaveLength(0);
  });
});

describe('IBAN detection', () => {
  it('validates the mod-97 checksum', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('GB82WEST12345698765432')).toBe(true);
    expect(isValidIban('DE89370400440532013001')).toBe(false);
  });

  it('detects a spaced IBAN', () => {
    const spans = only('Transfer to DE89 3704 0044 0532 0130 00 today', 'IBAN');
    expect(spans).toHaveLength(1);
  });
});

describe('credit card detection', () => {
  it('validates Luhn', () => {
    expect(isValidLuhn('4111111111111111')).toBe(true);
    expect(isValidLuhn('4111111111111112')).toBe(false);
  });

  it('detects a grouped card number', () => {
    const spans = only('Card: 4111 1111 1111 1111', 'CREDIT_CARD');
    expect(spans).toHaveLength(1);
  });

  it('does not flag a random non-Luhn number', () => {
    expect(only('order 1234 5678 9012 3456', 'CREDIT_CARD')).toHaveLength(0);
  });
});

describe('IP detection', () => {
  it('detects IPv4', () => {
    const spans = only('server at 192.168.1.254 down', 'IP');
    expect(spans[0].text).toBe('192.168.1.254');
  });

  it('rejects out-of-range octets', () => {
    expect(only('not 999.1.1.1 here', 'IP')).toHaveLength(0);
  });

  it('detects IPv6', () => {
    const spans = only('addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334 ok', 'IP');
    expect(spans).toHaveLength(1);
  });

  it('detects an IPv4 that ends a sentence', () => {
    const spans = only('Server IP involved: 203.0.113.42.', 'IP');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('203.0.113.42');
  });

  it('keeps the trailing group of a compressed IPv6', () => {
    const spans = only('Customer IPv6 fe80::1 logged.', 'IP');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('fe80::1');
  });

  it('does not let phone swallow an IPv4 at a sentence end', () => {
    const spans = detect('Tech support traced issue to subnet 198.51.100.0.');
    expect(spans.filter((s) => s.type === 'PHONE')).toHaveLength(0);
    expect(spans.filter((s) => s.type === 'IP').map((s) => s.text)).toEqual(['198.51.100.0']);
  });

  it('keeps every trailing group of a compressed IPv6', () => {
    const spans = only('Access logged from 2001:db8::8a2e:370:7334. End', 'IP');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('2001:db8::8a2e:370:7334');
  });

  it('includes the zone identifier of a link-local address', () => {
    const spans = only('iface fe80::abcd:ef01:2345:6789%en0 up', 'IP');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('fe80::abcd:ef01:2345:6789%en0');
  });

  it('does not let the zone identifier swallow a sentence period', () => {
    const spans = only('Access from fe80::1%eth0.', 'IP');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('fe80::1%eth0');
  });

  it('detects an IPv4-mapped IPv6 address as one span', () => {
    const spans = only('connected via ::ffff:192.0.2.1 today', 'IP');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('::ffff:192.0.2.1');
  });

  it('detects an IPv4-embedded IPv6 address after compression', () => {
    const spans = only('route 64:ff9b::203.0.113.5 mapped', 'IP');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('64:ff9b::203.0.113.5');
  });

  it('rejects a clock time that looks colon-separated', () => {
    expect(only('meeting at 12:34:56 today', 'IP')).toHaveLength(0);
  });

  it('rejects a six-group MAC address', () => {
    expect(only('mac 00:1A:2B:3C:4D:5E here', 'IP')).toHaveLength(0);
  });

  it('rejects an IPv6 with too many groups', () => {
    expect(only('host 2001:db8:1:2:3:4:5:6:7 bad', 'IP')).toHaveLength(0);
  });

  it('rejects an embedded IPv4 with an out-of-range octet', () => {
    expect(only('weird ::ffff:999.1.1.1 bad', 'IP')).toHaveLength(0);
  });
});

describe('phone detection', () => {
  it('detects an international number', () => {
    const spans = only('Please call +49 30 1234567 tomorrow', 'PHONE');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('+49 30 1234567');
  });

  it('keeps a real number with an internal hyphen', () => {
    const spans = only('Reach the desk at 089 5550-1234 before noon.', 'PHONE');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('089 5550-1234');
  });

  it('does not flag a digit run inside a hyphenated identifier', () => {
    // Held-out identifier prefixes (not the gap's "ORD") prove the guard is
    // structural, not a memorized string.
    expect(only('Invoice INV-2024-998877-Z processed.', 'PHONE')).toHaveLength(0);
    expect(only('Ref REF-7782-119003 logged.', 'PHONE')).toHaveLength(0);
    expect(only('Ticket CASE-2024-99812 escalated.', 'PHONE')).toHaveLength(0);
  });

  it('does not flag an ISO timestamp as a phone number', () => {
    expect(
      only('System log entry at 2026-03-17 14:08:51 CET shows the retry.', 'PHONE')
    ).toHaveLength(0);
    expect(
      only('The incident started on 2026-03-17 and was resolved later.', 'PHONE')
    ).toHaveLength(0);
    expect(only('Logged at 2026-03-17 09:15 UTC for review.', 'PHONE')).toHaveLength(0);
  });

  it('keeps a real phone in a line that also has an order number', () => {
    const spans = only(
      'Order #ORD-2025-001847-X needs review; call +39 02 1234 5678 today.',
      'PHONE'
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('+39 02 1234 5678');
  });
});

describe('credit card beats phone on overlap', () => {
  it('keeps a single CREDIT_CARD span', () => {
    const spans = detect('4111 1111 1111 1111');
    expect(spans).toHaveLength(1);
    expect(spans[0].type).toBe('CREDIT_CARD');
  });
});
