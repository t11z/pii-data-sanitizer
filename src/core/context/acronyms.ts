/**
 * A 2–4 character Latin token written entirely in ASCII uppercase is an
 * acronym / initialism in business and support prose — ID, PIN, DOB, URL, HQ,
 * SSN, CEO, CFO, HR, IT, QA, UI, UX, OS, DB, ATM, BIN, EU, US, UK, EIN, FYI,
 * IBAN — never a human name. Real names appear in mixed case ("Sarah", "Smith",
 * "García"); the surface alone is the signal, so the rule is purely structural
 * (no closed list). The lowercase form may collide with a long-tail surname
 * surface ("pin", "ui", "os" are all in the US-Census ext-tier list), but the
 * user wrote it in caps, which is the intent that matters.
 *
 * The 2–4 length window is deliberate: single letters are handled by the
 * tokenizer's period-aware splitting (initials), and 5+ letter all-caps runs
 * may be a name written in caps for emphasis ("SMITH", "GARCIA") — those are
 * left to the existing layers.
 *
 * ASCII-only on purpose. Non-Latin scripts (Devanagari, Hangul, Arabic,
 * Hebrew, Cyrillic) follow different conventions and never feed through this
 * gate.
 */
export function isLikelyAcronym(token: string): boolean {
  return /^[A-Z]{2,4}$/.test(token);
}
