import { describe, it, expect } from 'vitest';
import { detect } from '../index';
import { nameSourceFromBuildInputs } from '../db/fromSources';

// Recall lock for real names whose given name or surname is also an everyday
// word — a nationality ("French"), a landform ("Lake", "Bay"), a street type
// ("Street", "Lane", "Court"), a building ("Temple", "Castle"), an occupation
// ("Cook", "Koch", "Bishop") or a plain adjective/noun ("Green", "Hope").
//
// Why this exists: false-positive guards that put such words into a block list
// (NON_NAME_WORDS, demonym/landmark/street lists, start-of-name blocks) make the
// whole person disappear, because once the surname is blocked the lone given name
// usually scores below threshold. The benchmark corpus cannot catch this: every
// guard PR passes it with the cases it chose itself. A missed name is a privacy
// leak; a false positive is only over-redaction — so a guard that breaks a case
// here must be narrowed, and this list must not be trimmed to make it pass.
//
// Each name is checked in four frames — sentence-initial, after a role cue,
// mid-sentence, and right after a ticket/ID number — because guards often only
// bite in one position (e.g. a house-number street guard fires on "4471 <Name>").
//
// Known, deliberate exceptions (not listed): "Holding" as a surname (accepted
// trade-off of the company-designator guard) and sentence-initial "Will" (read
// as the modal verb).
const COLLIDING_NAMES = [
  // nationalities / demonyms
  'Dawn French',
  'Tom English',
  'Mark Cuban',
  'Amy Welsh',
  // landforms and water
  'Ricki Lake',
  'River Phoenix',
  'Michael Bay',
  'Sandy Bay',
  'Rachel Bay',
  'Faith Hill',
  'Maria Hill',
  'Peter Brook',
  'Anna Marsh',
  'Laura Field',
  'Joan Rivers',
  'Anna Berg',
  'Klaus Wald',
  // streets and places
  'Della Street',
  'Picabo Street',
  'Aubrey Plaza',
  'Nathan Lane',
  'Ruby Lane',
  'Margaret Court',
  'Grace Park',
  'Sarah Road',
  'Jack Drive',
  'Kevin Bridge',
  'Karl Brücke',
  'Ethan Hall',
  // buildings and institutions
  'Shirley Temple',
  'Alonzo Church',
  'Ivy Chapel',
  'Ben Abbey',
  'Mia Castle',
  'Noah Tower',
  'Sophie Mill',
  'Petra Haus',
  'Paul Bank',
  'Ann Banks',
  'Tom Ward',
  'Bill Gates',
  'Emily Post',
  // occupations and ranks
  'Tim Cook',
  'Maria Koch',
  'Lena Schuster',
  'Jens Weber',
  'Hans Fischer',
  'Holly Hunter',
  'Lucy Bishop',
  'Dan Major',
  'Penny Marshall',
  'Robin Wright',
  // colours, materials, adjectives, nouns
  'Jack White',
  'Eva Green',
  'Emma Stone',
  'Olivia Wood',
  'Kevin Hart',
  'Harrison Ford',
  'Ella Price',
  'Max Power',
  'Leo Strong',
  'Zoe Bell',
  'Kim Young',
  'Lee Long',
  // given names that are everyday words
  'Grace Kelly',
  'Faith Evans',
  'Hope Davis',
  'Rose Byrne',
  'Joy Bryant',
];

const FRAMES: Array<(name: string) => string> = [
  (n) => `${n} called today.`,
  (n) => `Customer ${n} confirmed the refund.`,
  (n) => `Please forward this to ${n} by Friday.`,
  (n) => `Ticket 4471 ${n} called back.`,
];

describe('real names that collide with everyday words stay detected', () => {
  const source = nameSourceFromBuildInputs();
  const persons = (text: string) =>
    detect(text, { nameSource: source })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  for (const name of COLLIDING_NAMES) {
    it(`detects "${name}" as one full PERSON span in every frame`, () => {
      for (const frame of FRAMES) {
        const text = frame(name);
        expect(persons(text), text).toContain(name);
      }
    });
  }
});
