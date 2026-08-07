// A reference marker — '#' or its European equivalent '№' — immediately preceding a
// digit run marks it as a case / ticket / order / bug / invoice identifier, never a
// piece of personal PII. Support desks and issue trackers write "Case #567-89-1234",
// "Ticket № 345-67-8901", "Order #12 345 678". A structured-ID detector (SSN, phone)
// whose pattern would otherwise fire on the digits must defer to this marker: it is a
// pure structural signal, independent of the label's language or the identifier scheme.

/**
 * True when `start` is immediately preceded by a '#' or '№' reference marker, allowing
 * only horizontal whitespace ("Case # 567-89-1234") between the marker and the run.
 */
export function precededByRefMarker(text: string, start: number): boolean {
  let i = start - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  return i >= 0 && (text[i] === '#' || text[i] === '№');
}
