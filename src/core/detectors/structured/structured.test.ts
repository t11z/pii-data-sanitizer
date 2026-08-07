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

  it('detects an IBAN printed with a space between country code and check digits', () => {
    // Held-out valid IBANs (Wikipedia reference values, distinct from the
    // DE89… case already covered). Each is printed with the very common
    // "CC dd …" formatting where a space sits between the 2-letter country
    // code and the 2-digit check, which the original regex rejected.
    expect(only('Wire to BE 68 5390 0754 7034 today', 'IBAN')[0].text).toBe('BE 68 5390 0754 7034');
    expect(only('IBAN: IT 60 X054 2811 1010 0000 0123 456 ok.', 'IBAN')[0].text).toBe(
      'IT 60 X054 2811 1010 0000 0123 456'
    );
    expect(only('Use NL 91 ABNA 0417 1643 00 please.', 'IBAN')[0].text).toBe(
      'NL 91 ABNA 0417 1643 00'
    );
  });

  it('does not flag an uncued country-code-shaped run that fails mod-97', () => {
    // Precision guard for the BARE-regex (uncued) path: an arbitrary
    // "XX dd …" string whose checksum is wrong must stay silent — the looser
    // regex must not leak FPs on its own. The cued path requires the "IBAN"
    // acronym, so swapping in a non-cue introducer keeps this guard exercising
    // the uncued path even after the cue-anchored fix.
    expect(only('Send to BE 68 5390 0754 7035 today', 'IBAN')).toHaveLength(0);
    expect(only('See AB 12 3456 7890 1234 5678 9012 here', 'IBAN')).toHaveLength(0);
  });

  it('detects IBANs across diverse jurisdictions (country-length gate must not drop recall)', () => {
    // Held-out mod-97-valid IBANs from countries not exercised elsewhere in the
    // suite (ES/AT/CH/TR/SE/NO). The new country-length gate must accept the
    // canonical length for each — this proves the gate generalizes across the
    // registry, not just the DE/BE/IT/NL examples already covered above.
    expect(only('Wire to ES91 2100 0418 4502 0005 1332 by Friday', 'IBAN')[0].text).toBe(
      'ES91 2100 0418 4502 0005 1332'
    );
    expect(only('Settlement AT61 1904 3002 3457 3201 cleared', 'IBAN')[0].text).toBe(
      'AT61 1904 3002 3457 3201'
    );
    expect(only('Refund CH93 0076 2011 6238 5295 7 sent', 'IBAN')[0].text).toBe(
      'CH93 0076 2011 6238 5295 7'
    );
    expect(only('IBAN TR33 0006 1005 1978 6457 8413 26 on file', 'IBAN')[0].text).toBe(
      'TR33 0006 1005 1978 6457 8413 26'
    );
    expect(only('Customer NO93 8601 1117 947 confirmed', 'IBAN')[0].text).toBe(
      'NO93 8601 1117 947'
    );
  });

  it('rejects uncued mod-97-valid runs whose compact length differs from the country registry', () => {
    // mod-97 alone passes ~1 in 97 random strings, so a longer-than-canonical
    // run can checksum-validate by chance — exactly how the gap report's
    // `BR15 0000 …` substring (32 compact chars, BR official is 29) leaked as
    // an IBAN. Each value below is mod-97-valid but constructed to violate the
    // country's registered length; these are *held-out* (not the BR string
    // from the gap) — they were generated by the same precision flaw applied
    // to other jurisdictions, so accepting them would mean the gate is
    // memorizing one shape rather than enforcing the registry. Phrased without
    // the "IBAN" cue so the country-length gate is exercised on its own — the
    // cue-anchored path intentionally accepts these shapes (see cue-anchored
    // test below).
    expect(only('Reference DE28 3704 0044 0532 0130 0000 00 attached', 'IBAN')).toHaveLength(0); // 26 vs DE=22
    expect(only('Code GB12 WEST 1234 5698 7654 3200 00 on file', 'IBAN')).toHaveLength(0); // 26 vs GB=22
    expect(only('Token NL61 ABNA 0417 1643 0000 00 today', 'IBAN')).toHaveLength(0); // 22 vs NL=18
  });

  it('still rejects the original gap-report shape when no cue precedes (BR over-long substring stays silent)', () => {
    // The original gap: a 32-char `BR15 …` substring that mod-97-validated and
    // was reported as an IBAN even though BR's registered length is 29. The
    // country-length gate keeps the uncued path quiet on this shape; we drop
    // the "IBAN:" prefix from the original failure case so the uncued gate is
    // exercised. (Privacy-first stance: the cued form — same digits after the
    // literal acronym — is intentionally redacted via the cue-anchored path,
    // covered separately below.)
    expect(
      only(
        'TAC #4475 — Eng. coordinated transfer. BR15 0000 0000 0000 0000 0000 0000 0000 0001 on file.',
        'IBAN'
      )
    ).toHaveLength(0);
  });

  it('cue-anchored path catches an IBAN-shape that strict mod-97 rejects', () => {
    // Held-out values, none in the synthetic gap feed, all strict-invalid (see
    // isValidIban() below). Each fires through the cued path because the
    // standalone acronym precedes the shape, generalizing across a length-OK +
    // checksum-broken IT, two unassigned-CC codes, and a CC+space form.
    expect(isValidIban('IT99 X054 2811 1010 0000 0123 456')).toBe(false);
    expect(isValidIban('XQ12 3456 7890 1234 5678 9012')).toBe(false);
    expect(isValidIban('ZK00 1122 3344 5566 7788')).toBe(false);
    expect(isValidIban('BE 68 5390 0754 7035')).toBe(false);
    expect(only('Refund to IBAN IT99 X054 2811 1010 0000 0123 456 cleared.', 'IBAN')[0].text).toBe(
      'IT99 X054 2811 1010 0000 0123 456'
    );
    expect(only('Wire IBAN: XQ12 3456 7890 1234 5678 9012 ok', 'IBAN')[0].text).toBe(
      'XQ12 3456 7890 1234 5678 9012'
    );
    expect(only('Refund processed to IBAN ZK00 1122 3344 5566 7788 on file.', 'IBAN')[0].text).toBe(
      'ZK00 1122 3344 5566 7788'
    );
    expect(only('Transfer IBAN BE 68 5390 0754 7035 today', 'IBAN')[0].text).toBe(
      'BE 68 5390 0754 7035'
    );
  });

  it('cue-anchored path catches paren-/bracket-wrapped IBANs after the cue word', () => {
    // Held-out, strict-invalid IBAN-shape values wrapped in `(...)`, `[...]`,
    // and `{...}` immediately after the `IBAN` cue — a common real-world
    // convention in banking prose ("customer's IBAN (AE07 …) verified"). Prior
    // to the separator-class extension, the cued path only accepted whitespace
    // and colons between cue and shape, so these never fired. Values match
    // exactly the shape captured by the cued path (no trailing `)`).
    expect(isValidIban('AE 07 0331 2345 6789 1234 567')).toBe(false);
    expect(isValidIban('IT99 X054 2811 1010 0000 0123 456')).toBe(false);
    expect(isValidIban('ZK00 1122 3344 5566 7788')).toBe(false);
    expect(isValidIban('XQ12 3456 7890 1234 5678 9012')).toBe(false);
    // Paren-wrapped IBAN body — the failing gap-report shape:
    expect(
      only("Customer's IBAN (AE 07 0331 2345 6789 1234 567) verified today.", 'IBAN')[0].text
    ).toBe('AE 07 0331 2345 6789 1234 567');
    // Bracket-wrapped:
    expect(only('Refund IBAN [ZK00 1122 3344 5566 7788] on file.', 'IBAN')[0].text).toBe(
      'ZK00 1122 3344 5566 7788'
    );
    // Colon + paren — real transcripts often stack them ("IBAN: (…)"):
    expect(only('Settlement IBAN: (XQ12 3456 7890 1234 5678 9012) posted.', 'IBAN')[0].text).toBe(
      'XQ12 3456 7890 1234 5678 9012'
    );
    // Plain paren wrap on a strict-invalid IT shape:
    expect(only('Wire IBAN (IT99 X054 2811 1010 0000 0123 456) cleared.', 'IBAN')[0].text).toBe(
      'IT99 X054 2811 1010 0000 0123 456'
    );
  });

  it('bracket separator does not leak on cue word without IBAN shape after it', () => {
    // Precision guards: `IBAN` followed by an opening bracket must still emit
    // nothing when the bracket does not enclose a real IBAN shape. Same guard
    // shape as the whitespace/colon path — the added separator characters must
    // not create a new leak surface.
    expect(only('The IBAN (format) is documented on the wiki.', 'IBAN')).toHaveLength(0);
    expect(only('See IBAN [docs] in the runbook.', 'IBAN')).toHaveLength(0);
    expect(only('Customer asked about IBAN (setup) today.', 'IBAN')).toHaveLength(0);
    // A short 2-letter+2-digit token that stops before the IBAN body length
    // requirement (10–30 alphanumeric groups) must not match either — proves
    // the shape gate remains load-bearing after the separator change.
    expect(only('Ref IBAN (AB 12 CD) noted.', 'IBAN')).toHaveLength(0);
  });

  it('cue-anchored path stays silent without the cue word (precision)', () => {
    // Same held-out IBAN-shape values, no preceding "IBAN" cue → the strict
    // path correctly refuses them and the cued path never fires. Proves the
    // cue gate is load-bearing, not a blanket loosening of mod-97.
    expect(only('Reference ZK00 1122 3344 5566 7788 attached for review.', 'IBAN')).toHaveLength(0);
    expect(only('Token XQ12 3456 7890 1234 5678 9012 logged.', 'IBAN')).toHaveLength(0);
    expect(only('Code IT99 X054 2811 1010 0000 0123 456 noted.', 'IBAN')).toHaveLength(0);
  });

  it('cue word alone (no IBAN-shape after) produces nothing', () => {
    // The cue word "IBAN" written in plain prose with no CC+digits after must
    // not emit a span — guards against the acronym being used as a noun in
    // documentation or instruction text.
    expect(only('The IBAN format guide is on the wiki for new agents.', 'IBAN')).toHaveLength(0);
    expect(only('See IBAN documentation in the runbook for compliance.', 'IBAN')).toHaveLength(0);
    expect(only('Customer asked about IBAN setup today.', 'IBAN')).toHaveLength(0);
  });

  it('cued IBAN shields cascade PERSON / CREDIT_CARD / PHONE matches inside its body', () => {
    // Each text below contains a strict-invalid IBAN-shape that — without the
    // cue path — leaks one cascade FP through resolveOverlaps. With the cued
    // path emitting an IBAN at 0.96, the lower-confidence cascade span is
    // overlap-suppressed. Held-out fragments, not the gap-report values.
    //   "IBAN <CC>" → PERSON (because `iban` is a Basque given name in ext):
    const a = detect('Refund to account IBAN IT99 X054 2811 1010 0000 0123 456 confirmed.');
    expect(a.filter((s) => s.type === 'PERSON')).toHaveLength(0);
    expect(a.find((s) => s.type === 'IBAN')?.text).toBe('IT99 X054 2811 1010 0000 0123 456');
    //   Luhn-valid 16-digit run sitting inside an IBAN-shape body → CREDIT_CARD:
    //   "4111 1111 1111 1111" is Luhn-valid; placed inside a cued IBAN body,
    //   the cued IBAN at 0.96 outranks the CC at 0.95 on overlap.
    const b = detect('Refund to IBAN ZK99 4111 1111 1111 1111 confirmed.');
    expect(b.filter((s) => s.type === 'CREDIT_CARD')).toHaveLength(0);
    expect(b.find((s) => s.type === 'IBAN')?.text).toBe('ZK99 4111 1111 1111 1111');
    //   4-4-4 digit groups inside an IBAN body → PHONE@0.6 (well below 0.96):
    const c = detect('Settlement IBAN XQ12 0110 0001 2345 6789 0001 done.');
    expect(c.filter((s) => s.type === 'PHONE')).toHaveLength(0);
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

  it('rejects 0-prefixed Luhn-valid digit runs (ISO 7812 MII 0 is not a card)', () => {
    // The FP from the gap report: 16 zeros pass Luhn (sum=0), but MII 0 is
    // reserved by ISO/IEC 7812-1 and never issued by a payment network.
    expect(only('placeholder 0000 0000 0000 0000 today', 'CREDIT_CARD')).toHaveLength(0);
    // Held-out 0-prefixed Luhn-valid PAN (not the all-zeros string) proves the
    // guard is structural, not a memorized value — this string passes Luhn but
    // must still be rejected because MII 0 is reserved by ISO 7812.
    expect(only('template 0123 4567 8901 2347 row', 'CREDIT_CARD')).toHaveLength(0);
    // Positive guard: a 0-prefixed PAN inside a longer IBAN context (the actual
    // shape that triggered the gap) must stay silent.
    expect(
      only(
        'Billing update: IBAN BR15 0000 0000 0000 0000 0000 0000 C 00 set for review.',
        'CREDIT_CARD'
      )
    ).toHaveLength(0);
  });

  it('still detects real-network PANs with a non-zero MII', () => {
    // Held-out Luhn-valid PANs across MIIs 3/4/5/6, distinct from the existing
    // 4111… case, confirm the new guard only filters the 0-prefix class.
    expect(only('Card: 5500 0000 0000 0004', 'CREDIT_CARD')[0].text).toBe('5500 0000 0000 0004');
    expect(only('Card: 3782 822463 10005', 'CREDIT_CARD')[0].text).toBe('3782 822463 10005');
    expect(only('Card: 6011 0009 9013 9424', 'CREDIT_CARD')[0].text).toBe('6011 0009 9013 9424');
  });

  it('rejects Luhn-valid runs whose grouping does not match a payment-network format', () => {
    // The gap-report shape: an IBAN with irregular spacing ("ES9121 4300 001
    // 1874756") makes "4300 001 1874756" a 14-digit 4-3-7 run that Luhn-passes
    // (sum=50) but no payment network prints 4-3-7. The grouping guard rejects
    // it structurally.
    expect(
      only('Billing dispute filed. IBAN ES9121 4300 001 1874756 updated for review.', 'CREDIT_CARD')
    ).toHaveLength(0);
    // Held-out 14-digit 4-3-7 Luhn-valid run, distinct digits from the gap
    // value — the guard is structural, not memorized. (5123 456 1234561:
    // sum=50, passes Luhn; grouping 4-3-7 is not a network format.)
    expect(only('Reference 5123 456 1234561 attached', 'CREDIT_CARD')).toHaveLength(0);
    // Held-out 14-digit 4-2-4-4 Luhn-valid run (4929 88 8888 8883: sum=100,
    // passes Luhn). A 2-digit group never appears in print on real PANs.
    expect(only('Token 4929 88 8888 8883 logged', 'CREDIT_CARD')).toHaveLength(0);
  });

  it('still detects the four canonical grouped PAN widths after the guard', () => {
    // 4-4-4-4 (16): Visa/MC/Discover/JCB/UnionPay — see 4111…/5500…/6011… above.
    // The remaining three canonical groupings (Maestro 15, Amex 15, Diners 14)
    // are exercised here with held-out Luhn-valid PANs to prove the allowlist
    // matches every printed network width, not only the ones the corpus already
    // covers.
    // Maestro/UATP 4-4-4-3 (15): 5018 1234 5678 900 — Luhn-valid (sum=60).
    expect(only('Card: 5018 1234 5678 900', 'CREDIT_CARD')[0].text).toBe('5018 1234 5678 900');
    // Diners 4-6-4 (14): 3056 930902 5904 — Luhn-valid Diners test PAN.
    expect(only('Card: 3056 930902 5904', 'CREDIT_CARD')[0].text).toBe('3056 930902 5904');
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

  it('captures an IPv4 CIDR suffix as part of the span', () => {
    // Held-out reserved-doc ranges (RFC 5737), absent from any dictionary
    // because IP detection is purely structural — these prove the suffix
    // capture is general, not memorized.
    expect(only('Firewall blocks 198.51.100.0/24 from the perimeter', 'IP')[0].text).toBe(
      '198.51.100.0/24'
    );
    expect(only('Single host 203.0.113.42/32 only', 'IP')[0].text).toBe('203.0.113.42/32');
  });

  it('captures an IPv6 CIDR suffix as part of the span', () => {
    expect(only('Customer access from 2600:1700::/32 today', 'IP')[0].text).toBe('2600:1700::/32');
    expect(only('SOC alert flagged 2001:db8:1234::/48 overnight', 'IP')[0].text).toBe(
      '2001:db8:1234::/48'
    );
  });

  it('captures CIDR after an IPv6 zone identifier', () => {
    expect(only('Edge node fe80::1%eth0/64 came online', 'IP')[0].text).toBe('fe80::1%eth0/64');
  });

  it('captures CIDR after an IPv4-mapped IPv6 address', () => {
    expect(only('Tunnel ::ffff:198.51.100.7/120 ok', 'IP')[0].text).toBe('::ffff:198.51.100.7/120');
  });

  it('rejects an IPv4 CIDR with prefix length > 32 (falls back to the bare address)', () => {
    // Precision guard: a malformed mask must not be reported as part of the
    // span, but the bare valid IP should still be detected so recall is
    // preserved on the address itself.
    expect(only('Bad mask 10.0.0.0/64 was logged', 'IP').map((s) => s.text)).toEqual(['10.0.0.0']);
  });

  it('rejects an IPv6 CIDR with prefix length > 128 (falls back to the bare address)', () => {
    expect(only('Operator typed 2001:db8::/200 by mistake', 'IP').map((s) => s.text)).toEqual([
      '2001:db8::',
    ]);
  });

  it('does not match a standalone /N mask with no address', () => {
    expect(only('Documentation says the subnet mask /24 is default', 'IP')).toHaveLength(0);
  });

  it('does not extend an IPv4 into a URL path that starts with letters', () => {
    // The `/N` suffix requires digits, so `/admin` is left for the URL — the
    // address span stops at the IP. This protects precision when an IP is
    // followed by a slash-delimited URL path.
    expect(only('Visit the runbook at 192.168.1.1/admin/login for details', 'IP')[0].text).toBe(
      '192.168.1.1'
    );
  });

  it('does not flag IANA-reserved non-identifier addresses (loopback / unspecified / broadcast)', () => {
    // These addresses are reserved by IANA and never refer to a specific
    // addressable entity, so they cannot be PII. The values below are HELD OUT
    // from the single FP case that exposed this bug (`127.0.0.1`): we cover
    // other points in the loopback /8, the IPv6 loopback literal, and the two
    // IPv4 special-meaning constants so the test proves the whole reserved
    // class is filtered, not just the one address.
    expect(only('Bind dev server to 127.0.0.1 only', 'IP')).toHaveLength(0);
    expect(only('Probe also hit 127.4.5.6 from the loopback range', 'IP')).toHaveLength(0);
    expect(only('Loopback subnet 127.0.0.0/8 reserved by IANA', 'IP')).toHaveLength(0);
    expect(only('IPv6 loopback ::1 came up', 'IP')).toHaveLength(0);
    expect(only('Listen on 0.0.0.0 for all interfaces', 'IP')).toHaveLength(0);
    expect(only('Sent to 255.255.255.255 limited broadcast', 'IP')).toHaveLength(0);
  });

  it('keeps detecting addresses that CAN identify a device (precision guard for the filter)', () => {
    // Held-out positive guards: the filter must NOT swallow private RFC 1918,
    // link-local, documentation-range, or public addresses — those still
    // identify a network endpoint and remain valid PII candidates. Different
    // exact octets from the cases already covered above.
    expect(only('Gateway 10.20.30.40 reconfigured', 'IP')[0].text).toBe('10.20.30.40');
    expect(only('Office subnet 192.168.50.77 reachable', 'IP')[0].text).toBe('192.168.50.77');
    expect(only('Link-local 169.254.7.7 negotiated', 'IP')[0].text).toBe('169.254.7.7');
    expect(only('Docs example 203.0.113.99 cited', 'IP')[0].text).toBe('203.0.113.99');
    expect(only('Link-local fe80::beef logged', 'IP')[0].text).toBe('fe80::beef');
  });
});

describe('MAC detection', () => {
  it('detects a colon-separated MAC', () => {
    const spans = only('device 00:1A:2B:3C:4D:5E joined', 'MAC');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('00:1A:2B:3C:4D:5E');
  });

  it('detects a hyphen-separated MAC', () => {
    const spans = only('nic 00-1a-2b-3c-4d-5e online', 'MAC');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('00-1a-2b-3c-4d-5e');
  });

  it('detects a Cisco dot-notation MAC', () => {
    const spans = only('switch port 001a.2b3c.4d5e up', 'MAC');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('001a.2b3c.4d5e');
  });

  it('rejects a MAC with mixed separators', () => {
    expect(only('bad 00:1A-2B:3C:4D:5E here', 'MAC')).toHaveLength(0);
  });

  // Held-out values (not in any corpus/gap case): prove the compact-triple-group
  // heuristic generalizes rather than memorizing the specific gap addresses.
  it('detects a hyphenated compact (triple-group) MAC', () => {
    const spans = only('filter applied to de1f-2a3b-4c5d online', 'MAC');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('de1f-2a3b-4c5d');
  });

  it('detects a Cisco dot-notation MAC that ends a sentence', () => {
    // The trailing period is sentence punctuation, not part of the address; the
    // old `(?![\w.])` guard swallowed it and dropped the whole MAC.
    const spans = only('Isolated port with MAC 9c8d.7e6f.5a4b.', 'MAC');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('9c8d.7e6f.5a4b');
  });

  it('detects a hyphenated compact MAC that ends a sentence', () => {
    const spans = only('Reinstalled adapter de1f-2a3b-4c5d.', 'MAC');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('de1f-2a3b-4c5d');
  });

  it('does not match a fragment of a longer dotted hex run', () => {
    // A four-group run is not a valid triple-group MAC; grabbing the first
    // three groups would be a false positive.
    expect(only('checksum 1234.5678.9abc.def0 stored', 'MAC')).toHaveLength(0);
  });

  it('does not match a fragment of a longer hyphenated hex run', () => {
    expect(only('serial de1f-2a3b-4c5d-6e7f logged', 'MAC')).toHaveLength(0);
  });

  it('rejects a compact triple-group with mixed dot/hyphen separators', () => {
    expect(only('bad de1f.2a3b-4c5d here', 'MAC')).toHaveLength(0);
  });

  it('does not flag a bare 12-hex run without separators', () => {
    expect(only('token 001A2B3C4D5E issued', 'MAC')).toHaveLength(0);
  });

  it('does not match inside a longer hex run', () => {
    expect(only('hash ff00:1A:2B:3C:4D:5Eff value', 'MAC')).toHaveLength(0);
  });

  it('rejects a clock time that looks colon-separated', () => {
    expect(only('meeting at 12:34:56 today', 'MAC')).toHaveLength(0);
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

  it('does not flag a space-only ≥13-digit run (card-shaped)', () => {
    // Held-out card-shaped groupings (not the gap's "3782 822463 1005") prove
    // the guard is structural — pure digits + spaces, no '+' / parens / hyphen
    // / dot / slash, ≥13 digits in the card domain (13–19) — and not a
    // memorized string. All three are Luhn-invalid so the credit-card detector
    // does not claim them; without this guard they would surface as PHONE.
    expect(only('Token 1234 5678 9012 3 referenced.', 'PHONE')).toHaveLength(0); // 13d (4-4-4-1)
    expect(only('PAN 3056 123456 7890 disputed.', 'PHONE')).toHaveLength(0); // 14d (4-6-4)
    expect(only('Card on file: 3782 123456 78901 reviewed.', 'PHONE')).toHaveLength(0); // 15d (4-6-5)
  });

  it('keeps phone candidates with phone punctuation even at the digit ceiling', () => {
    // The guard only fires when the run has *no* phone-shaped punctuation.
    // A 13-digit run with '+' or '-' is still a plausible phone (long
    // domestic-with-extension or country-code formats), so the guard must
    // not strip it.
    expect(only('Reach +1 800 555 1234 567 anytime.', 'PHONE')).toHaveLength(1); // 13d, has '+'
    expect(only('Call 030-1234-567-8901 today.', 'PHONE')).toHaveLength(1); // 14d, has '-'
  });

  it('keeps an international number written with country code but no "+"', () => {
    // Held-out country codes (FR 33, IT 39, ES 34 — distinct from the German
    // "49" gap case) prove the heuristic generalizes: any space-grouped
    // ≥13-digit run whose FIRST group is 1–3 digits is country-code-without-`+`
    // shape (Visa/MC/AmEx/Diners all start with a 4-digit group, so the leading
    // group's size structurally distinguishes the two patterns).
    expect(only('Customer called 33 1 4070 1234 56 from Paris.', 'PHONE')[0].text).toBe(
      '33 1 4070 1234 56'
    );
    expect(only('Reach the agent at 39 06 4555 1234 567 today.', 'PHONE')[0].text).toBe(
      '39 06 4555 1234 567'
    );
    expect(only('Mobile 34 91 5555 678 901 confirmed.', 'PHONE')[0].text).toBe(
      '34 91 5555 678 901'
    );
  });

  it('still rejects card-shaped ≥13-digit runs (leading 4-digit group)', () => {
    // Precision guard for the refined rule: narrowing the card-shape reject to
    // "first group of 4" must NOT let any Luhn-invalid PAN layout leak through.
    // Held-out card-shape values (distinct from the proven Visa 4111… and the
    // issue #74 AmEx case) cover all four card group patterns.
    expect(only('Reference 4532 9876 5432 1098 dropped.', 'PHONE')).toHaveLength(0); // 4-4-4-4
    expect(only('Card on file 5555 4444 3333 2 disputed.', 'PHONE')).toHaveLength(0); // 4-4-4-1 (13d)
    expect(only('Disputed PAN 3056 654321 0987 today.', 'PHONE')).toHaveLength(0); // 4-6-4 (14d)
    expect(only('PAN 3782 654321 09876 reviewed.', 'PHONE')).toHaveLength(0); // 4-6-5 (15d)
  });

  it('still rejects fused 13+ digit identifier runs (no grouping)', () => {
    // The other half of the refined rule: a 13+ digit run with no spaces is
    // also identifier-shaped (bank account / reference / barcode), never
    // phone-shaped. Held-out lengths in the 13–19 digit window.
    expect(only('Reference 1234567890123 attached.', 'PHONE')).toHaveLength(0); // 13d fused
    expect(only('Account 987654321098765 verified.', 'PHONE')).toHaveLength(0); // 15d fused
  });
});

describe('credit card beats phone on overlap', () => {
  it('keeps a single CREDIT_CARD span', () => {
    const spans = detect('4111 1111 1111 1111');
    expect(spans).toHaveLength(1);
    expect(spans[0].type).toBe('CREDIT_CARD');
  });
});

describe('national id detection', () => {
  it('detects a dashed US SSN with valid allocation', () => {
    const spans = only('Employee SSN: 123-45-6789 on file.', 'NATIONAL_ID');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('123-45-6789');
  });

  it('wins over PHONE on the same SSN span', () => {
    // The 9-digit run could read as a phone (conf 0.6); the SSN (0.92) outranks it,
    // so overlap resolution leaves no PHONE span behind.
    expect(only('SSN 123-45-6789 recorded.', 'PHONE')).toHaveLength(0);
  });

  it('rejects never-assigned SSN areas/groups/serials', () => {
    expect(only('000-12-3456', 'NATIONAL_ID')).toHaveLength(0);
    expect(only('666-44-1234', 'NATIONAL_ID')).toHaveLength(0);
    expect(only('900-11-2222', 'NATIONAL_ID')).toHaveLength(0);
    expect(only('123-00-6789', 'NATIONAL_ID')).toHaveLength(0);
    expect(only('123-45-0000', 'NATIONAL_ID')).toHaveLength(0);
  });

  it('does not claim a bare 9-digit run as an SSN', () => {
    expect(only('Reference 123456789 attached.', 'NATIONAL_ID')).toHaveLength(0);
  });

  it('detects a German tax ID by structure + ISO 7064 checksum', () => {
    // Held-out valid Steuer-IDs (structure: one digit repeated, MOD 11,10 check digit).
    expect(only('Steuer-ID 86095742719 confirmed.', 'NATIONAL_ID')[0].text).toBe('86095742719');
    expect(only('IdNr 47036892816 hinterlegt.', 'NATIONAL_ID')[0].text).toBe('47036892816');
  });

  it('rejects an 11-digit run with a wrong tax-ID check digit', () => {
    expect(only('Number 86095742718 is not an ID.', 'NATIONAL_ID')).toHaveLength(0);
  });

  it('rejects an 11-digit run that fails the tax-ID structure', () => {
    // Phone-like run: several digits repeat, so the "exactly one repeated" rule fails.
    expect(only('Call 49301234567 for support.', 'NATIONAL_ID')).toHaveLength(0);
  });

  it('does not steal a 3-2-4 chunk from inside an international phone number', () => {
    // Held-out PT phone: "+351-21-1234-567" contains the 3-2-4 dashed run
    // "351-21-1234" which superficially matches the SSN regex. Because '+' is
    // a non-word char, \b alone happily anchors there. The adjacency guard
    // rejects the slice so PHONE wins on overlap and no spurious NATIONAL_ID
    // remains. The same logic generalises to any "+CC-..." phone whose
    // grouping happens to expose a 3-2-4 substring.
    const text = 'TAC #3847: Phone connection +351-21-1234-567 logged.';
    expect(only(text, 'NATIONAL_ID')).toHaveLength(0);
    const phones = only(text, 'PHONE');
    expect(phones).toHaveLength(1);
    expect(phones[0].text).toBe('+351-21-1234-567');
  });

  it('does not flag a 3-2-4 chunk inside a longer dashed identifier', () => {
    // Held-out alphanumeric reference: dashes continue past the 3-2-4 run on
    // both sides, so the candidate is a slice of a structured ID, not an SSN.
    expect(only('Ticket REF-234-56-7890-2026 attached.', 'NATIONAL_ID')).toHaveLength(0);
    expect(only('Order 234-56-7890-X is queued.', 'NATIONAL_ID')).toHaveLength(0);
  });

  it('detects an SSN glued to a textual cue label via a hyphen', () => {
    // Held-out SSN values (none equal to the space-cued case above): the leading
    // hyphen here separates a *letter* label from a standalone SSN, so it is a
    // cued SSN, not a slice of a longer number. The '-' abutting a letter must
    // not trigger the phone-slice guard.
    expect(only('Dispute for (ssn-078-32-4692) opened.', 'NATIONAL_ID')[0].text).toBe(
      '078-32-4692'
    );
    expect(only('SSN-123-45-6789 verified.', 'NATIONAL_ID')[0].text).toBe('123-45-6789');
    expect(only('id-256-78-9012 on file.', 'NATIONAL_ID')[0].text).toBe('256-78-9012');
  });

  it('still rejects a 3-2-4 slice of a longer purely-numeric dashed run', () => {
    // Held-out numeric run: the hyphen before the 3-2-4 chunk abuts a *digit*, so
    // the candidate really is a slice of a longer dashed number — keep rejecting.
    expect(only('Batch 12-345-67-8901 processed.', 'NATIONAL_ID')).toHaveLength(0);
  });
});

describe('passport detection (cue-gated)', () => {
  it('detects a passport number after an English cue', () => {
    expect(only('Passport No: X1234567 issued.', 'PASSPORT')[0].text).toBe('X1234567');
  });

  it('detects a passport number after a German cue', () => {
    expect(only('Reisepass C01X00T47 vorgelegt.', 'PASSPORT')[0].text).toBe('C01X00T47');
  });

  it('does not flag an alphanumeric token without a passport cue', () => {
    expect(only('Reference X1234567 attached.', 'PASSPORT')).toHaveLength(0);
  });

  it('does not flag a following word with no digit as a number', () => {
    expect(only('Passport please bring it tomorrow.', 'PASSPORT')).toHaveLength(0);
  });
});

describe('date of birth detection (cue-gated)', () => {
  it('detects an ISO date after a DOB cue', () => {
    expect(only('DOB: 1985-03-17 noted.', 'DATE_OF_BIRTH')[0].text).toBe('1985-03-17');
  });

  it('detects a numeric date after "born on"', () => {
    expect(only('born on 17.03.1985 in Berlin.', 'DATE_OF_BIRTH')[0].text).toBe('17.03.1985');
  });

  it('detects an English month-name date', () => {
    expect(only('Date of birth March 5, 1990.', 'DATE_OF_BIRTH')[0].text).toBe('March 5, 1990');
  });

  it('detects a German month-name date', () => {
    expect(only('Geburtsdatum: 12. März 1985.', 'DATE_OF_BIRTH')[0].text).toBe('12. März 1985');
  });

  it('does not flag an incidental date with no birth cue', () => {
    expect(only('The incident on 2024-01-15 was reviewed.', 'DATE_OF_BIRTH')).toHaveLength(0);
  });
});
