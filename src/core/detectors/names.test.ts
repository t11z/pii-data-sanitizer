import { describe, it, expect } from 'vitest';
import { detect } from '../index';
import { nameSourceFromSources, nameSourceFromBuildInputs } from '../db/fromSources';
import { PackNameSource } from '../db/packSource';

const nameSource = nameSourceFromSources();

const persons = (text: string) =>
  detect(text, { nameSource })
    .filter((s) => s.type === 'PERSON')
    .map((s) => s.text);

describe('multi-part Latin names', () => {
  it('detects a hyphenated given name with a nobiliary particle', () => {
    expect(persons('Ich traf Kai-Uwe von Braun gestern.')).toContain('Kai-Uwe von Braun');
  });

  it('detects given + family', () => {
    expect(persons('Report by John Smith was filed.')).toContain('John Smith');
  });

  it('detects a name after a title even if the surname is unknown', () => {
    expect(persons('Please ask Dr. Anjali Qwertz about it.')).toContain('Anjali Qwertz');
  });

  it('handles apostrophe names', () => {
    // "O'Brien" tokenizes as one unit; with a known given name it chains.
    expect(persons('We hired Michael Anderson last week.')).toContain('Michael Anderson');
  });
});

describe('particle chains across scripts (transliterated)', () => {
  it('detects Arabic-style "al-" surnames', () => {
    expect(persons('We spoke to Omar al Farouk briefly.')).toContain('Omar al Farouk');
  });

  it('detects Hebrew-style "ben" patronyms', () => {
    expect(persons('A speech by David ben Gurion.')).toContain('David ben Gurion');
  });
});

describe('context-based detection (generalizes beyond the DB)', () => {
  // All names below are deliberately ABSENT from the name database, so these only
  // pass via the title/role/particle heuristics — never via dictionary lookup.
  it('uses a title with a trailing dot ("Dr.") to detect an unknown name', () => {
    expect(persons('Please ask Dr. Zzz Qwertz about it.')).toContain('Zzz Qwertz');
  });

  it('detects an unknown full name after a role cue', () => {
    expect(persons('Account holder Nadia Brzezinski paid the invoice.')).toContain(
      'Nadia Brzezinski'
    );
    expect(persons('Engineer Tomasz Wojcik resolved the ticket.')).toContain('Tomasz Wojcik');
  });

  it('chains across a hyphenated particle surname ("al-Farouk")', () => {
    expect(persons('Forward the case to Omar al-Farouk.')).toContain('Omar al-Farouk');
  });

  it('combines a role cue and a hyphenated particle for an unknown name', () => {
    expect(persons('Engineer Amir al-Rashid handled the case.')).toContain('Amir al-Rashid');
  });

  it('does not turn a role cue + structural nouns into a person', () => {
    expect(persons('Customer Service Team responded quickly.')).toHaveLength(0);
    expect(persons('The Account Approval Form is attached.')).toHaveLength(0);
    expect(persons('Merchant Services were down.')).toHaveLength(0);
  });

  it('detects an unknown name after an abbreviated role prefix ("Eng.")', () => {
    expect(persons('Report filed by Eng. Dimitri Petrov this morning.')).toContain(
      'Dimitri Petrov'
    );
    expect(persons('Escalated by Eng. Sophia Papadopoulos yesterday.')).toContain(
      'Sophia Papadopoulos'
    );
    // Held-out hyphenated surname after the abbreviation.
    expect(persons('Support from Eng. Andreas Meyer-Krahmer overnight.')).toContain(
      'Andreas Meyer-Krahmer'
    );
  });

  it('does not let a full role word + period (a sentence boundary) start a name', () => {
    // "engineer." here ends a sentence; "Daily Briefing" must NOT become a person.
    // Only genuine abbreviations ("Eng.") get the dot-tolerant role gap.
    expect(persons('Please notify the duty engineer. Daily Briefing follows.')).toHaveLength(0);
    expect(persons('The lead engineer. Final Review is pending.')).toHaveLength(0);
  });

  it('does not turn an abbreviated role cue + structural nouns into a person', () => {
    expect(persons('Eng. Release Notes are attached for review.')).toHaveLength(0);
    expect(persons('Eng. Support Team responded.')).toHaveLength(0);
  });

  it('proves the abbreviated-role-cue names are held out (absent from the DB)', () => {
    // Guards rule: the "Eng." detections above must come from the heuristic, not
    // from dictionary membership. If any of these land in the DB later, the cases
    // above stop proving generalization and must be re-pointed at fresh held-outs.
    const heldOut: Array<[string, 'Latin']> = [
      ['dimitri', 'Latin'],
      ['petrov', 'Latin'],
      ['sophia', 'Latin'],
      ['papadopoulos', 'Latin'],
      ['andreas', 'Latin'],
      ['meyer', 'Latin'],
      ['krahmer', 'Latin'],
    ];
    for (const [word, script] of heldOut) {
      expect(nameSource.hasGiven(word, script), `${word} should be out-of-DB`).toBe(false);
      expect(nameSource.hasFamily(word, script), `${word} should be out-of-DB`).toBe(false);
    }
  });
});

describe('multi-particle name chains (de la, van der, von der, van den)', () => {
  // Verified against the FULL committed dictionary (core + ingested ext), so the
  // names below are genuinely held out — detection rides on the particle-run
  // heuristic plus a role/title cue, never on dictionary membership.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('chains a held-out surname across two particles after a role cue', () => {
    expect(personsFull('Engineer Wlodimar de la Qwesterveldt resolved the ticket.')).toContain(
      'Wlodimar de la Qwesterveldt'
    );
    expect(personsFull('Analyst Brunhildricka van der Zorblatt approved the refund.')).toContain(
      'Brunhildricka van der Zorblatt'
    );
  });

  it('chains a held-out surname across two particles after a title abbreviation', () => {
    expect(personsFull('Filed by Eng. Gwendolthar van den Vexbruck overnight.')).toContain(
      'Gwendolthar van den Vexbruck'
    );
  });

  it('proves the multi-particle names are held out (absent from the full DB)', () => {
    // The fix is the particle-run skip, not memorization: if any of these land in
    // the DB later, the cases above stop proving generalization — re-point them.
    const heldOut = [
      'wlodimar',
      'qwesterveldt',
      'brunhildricka',
      'zorblatt',
      'gwendolthar',
      'vexbruck',
    ];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('does not chain a particle run into an unknown structural noun', () => {
    // "van der Department" is not a surname — the non-name guard must reject the
    // structural noun even across a particle run, so no multi-token person forms.
    expect(personsFull('Account holder Tomasz van der Department closed early.')).not.toContain(
      'Tomasz van der Department'
    );
    expect(personsFull('Dr. Wlodimar de la Invoice was filed.')).not.toContain(
      'Wlodimar de la Invoice'
    );
  });

  it('does not start a name on a bare particle run', () => {
    expect(personsFull('Reach out to the de la team about it.')).toHaveLength(0);
  });
});

describe('false-positive guards', () => {
  it('does not flag lowercase common words', () => {
    expect(persons('She gave a frank and rose-tinted review.')).toHaveLength(0);
  });

  it('does not flag an ambiguous word at sentence start', () => {
    expect(persons('Mark my words on this.')).not.toContain('Mark');
  });

  it('does not flag a capitalized place that is not a name', () => {
    expect(persons('We will visit Berlin in May.')).toHaveLength(0);
  });
});

describe('Latin diacritic folding (matches accented surface forms to folded entries)', () => {
  // The Latin lists store most names ASCII-folded ("garcia", "lopez",
  // "gonzalez", "maria"). Before folding, the very same names appearing with
  // their accents were missed. These prove the accented forms are now detected.
  it('detects an accented surname stored ASCII-folded', () => {
    expect(persons('Alert: López, Fernando attempted login.')).toContain('López');
    expect(persons('TM Report: González, Isabel reached out.')).toContain('González');
  });

  it('detects an accented given+family pair stored ASCII-folded', () => {
    expect(persons('Report by José García was filed.')).toContain('José García');
  });

  it('still detects an entry stored WITH its diacritics (raw lookup unaffected)', () => {
    expect(persons('A message from Jürgen Kraus arrived.')).toContain('Jürgen Kraus');
  });

  it('proves the detections are held out: the accented forms are absent from the DB', () => {
    // Folding is the lever, not dictionary membership: the exact accented surface
    // forms used above are NOT in the pack (only their ASCII-folded keys are). If
    // any accented form is added later, re-point these at fresh held-outs.
    for (const word of ['garcía', 'maría', 'lópez', 'gonzález']) {
      expect(nameSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(nameSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('generalizes to any name: an unseen accented form folds to a core entry', () => {
    // The fixture knows only the ASCII key "qwzzelton"; the accented surface form
    // "Qwźżelton" is never added (raw membership is false), yet folding recovers
    // it. This is the heuristic working independent of which names exist.
    const fixture = new PackNameSource();
    fixture.addWords(['qwzzelton'], { script: 'Latin', tier: 'core' }, 'latin-core');
    expect(fixture.hasFamily('qwźżelton', 'Latin')).toBe(false);
    const found = detect('Please ask Dr. Qwźżelton about it.', { nameSource: fixture })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);
    expect(found).toContain('Qwźżelton');
  });

  it('does not turn accented common words or place names into people', () => {
    expect(persons('We will visit Bogotá in May.')).toHaveLength(0);
    expect(persons('She prefers café au lait every morning.')).toHaveLength(0);
    expect(persons('The Über rollout shipped on schedule.')).toHaveLength(0);
  });
});

describe('transcribed CJK names', () => {
  it('detects a Pinyin full name', () => {
    expect(persons('The award went to Zhang Wei this year.')).toContain('Zhang Wei');
  });

  it('detects a Romaji full name', () => {
    expect(persons('A novel by Haruki Murakami.')).toContain('Haruki Murakami');
  });
});

describe('native-script names', () => {
  it('detects a Devanagari name backed by the database', () => {
    expect(persons('यह प्रिया शर्मा है।')).toContain('प्रिया शर्मा');
  });
});

describe('mixed scripts in one document', () => {
  it('finds names in different scripts', () => {
    const found = persons('Email John Smith and also محمد حسن today.');
    expect(found).toContain('John Smith');
    expect(found).toContain('محمد حسن');
  });
});

describe('frequency tier influences scoring', () => {
  // A source where "rose" (an ambiguous word) lives only in the bulk ext tier,
  // alongside the unambiguous ext-only "zorblax"/"quux" and the core "anna".
  const tiered = new PackNameSource();
  tiered.addWords(['anna'], { script: 'Latin', tier: 'core' }, 'latin-core');
  tiered.addWords(['rose', 'zorblax', 'quux'], { script: 'Latin', tier: 'ext' }, 'latin-ext');

  const find = (text: string) =>
    detect(text, { nameSource: tiered })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('suppresses a single ambiguous word found only in the ext tier', () => {
    expect(find('I bought a Rose today.')).not.toContain('Rose');
  });

  it('still detects a core-tier given name', () => {
    expect(find('We met Anna today.')).toContain('Anna');
  });

  it('does not flag a lone bulk-only token without corroboration', () => {
    // With a large ext dictionary a single ext-only hit is more likely an
    // ordinary word than a person, so it needs a second name part, a title or a
    // role cue before it counts. (This is what keeps bulk vocabulary such as
    // "Friday"/"Service" from becoming false positives.)
    expect(find('We met Zorblax today.')).not.toContain('Zorblax');
  });

  it('detects a bulk-only name once a second part corroborates it', () => {
    expect(find('We met Zorblax Quux today.')).toContain('Zorblax Quux');
  });

  it('detects a bulk-only name after a title', () => {
    expect(find('Ask Dr. Zorblax about it.')).toContain('Zorblax');
  });
});

describe('clause-opening name after a colon/sentence boundary', () => {
  // Names constantly open a clause after a label in support prose ("Case
  // escalation: <Name>", "Support note: <Name>"). A known-but-bulk (ext) given
  // name was being dropped there by the sentence-start guard; it now anchors when
  // a real second name part corroborates it. Verified against the FULL committed
  // dictionary so the SURNAMES are genuinely held out — detection rides on the
  // heuristic (ext anchor + corroborating part), not on dictionary membership.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('anchors an ext given name + held-out surname at a clause start', () => {
    expect(personsFull('Case escalation: Bahar Qorvanni reached out today.')).toContain(
      'Bahar Qorvanni'
    );
  });

  it('anchors across a particle run at a clause start with a held-out surname', () => {
    expect(personsFull('Support note: Marcus de Zeldravix processed the claim.')).toContain(
      'Marcus de Zeldravix'
    );
  });

  it('proves the surnames are held out (absent from the full DB)', () => {
    // The lever is the corroborated sentence-start anchor, not memorization: if a
    // surname below lands in the DB later, re-point these at fresh held-outs.
    for (const word of ['qorvanni', 'zeldravix']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('still suppresses a lone ext given name at a clause start (no continuation)', () => {
    expect(personsFull('Case note: Bahar reached out about the order.')).not.toContain('Bahar');
  });

  it('does not let a clause-opener verb/greeting anchor a name', () => {
    // "Call"/"Best"/"Dear"/"Forward" are everyday words that also read as ext
    // names; the guard list keeps them from anchoring even with a capitalized
    // follower. (A genuine lone name elsewhere in the sentence may still detect.)
    expect(personsFull('Best Regards from the whole team.')).toHaveLength(0);
    expect(personsFull('Dear Customer, your refund is processing.')).toHaveLength(0);
    expect(personsFull('Subject: Refund Request was submitted.')).toHaveLength(0);
    expect(personsFull('Service Desk closed the ticket quickly.')).toHaveLength(0);
  });

  it('mechanism: an ext-only given anchors at sentence start only when corroborated', () => {
    // Fully controlled fixture: "korvan" is ext-only, "zelbrith" never added.
    const tiered = new PackNameSource();
    tiered.addWords(['anna'], { script: 'Latin', tier: 'core' }, 'latin-core');
    tiered.addWords(['korvan', 'best'], { script: 'Latin', tier: 'ext' }, 'latin-ext');
    const find = (text: string) =>
      detect(text, { nameSource: tiered })
        .filter((s) => s.type === 'PERSON')
        .map((s) => s.text);
    // Held out: a surname after the ext given anchors the whole name at a colon.
    // ("Filed by:" is a neutral label — no role/title cue — so the credit is the
    // sentence-start anchor relaxation, not the role path.)
    expect(tiered.hasFamily('zelbrith', 'Latin')).toBe(false);
    expect(find('Filed by: Korvan Zelbrith called in.')).toContain('Korvan Zelbrith');
    // No corroborating second part → the lone ext anchor stays suppressed.
    expect(find('Filed by: Korvan called in.')).not.toContain('Korvan');
    // A clause-opener anchor ("Best") is suppressed even with a follower.
    expect(find('Note: Best Zelbrith called in.')).not.toContain('Best Zelbrith');
  });
});
