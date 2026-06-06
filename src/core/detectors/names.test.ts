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

describe('Korean (Hangul) names', () => {
  const hangulSource = new PackNameSource();
  hangulSource.addWords(['김민준', '서연', '민준'], { script: 'Hangul', tier: 'core' });
  const koPersons = (text: string) =>
    detect(text, { nameSource: hangulSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects a Hangul name present in the database', () => {
    expect(koPersons('Please contact 김민준 about the shipment.')).toContain('김민준');
  });

  it('does not flag an unknown Hangul token without context', () => {
    expect(koPersons('Please contact 홍길동 about it.')).not.toContain('홍길동');
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

describe('Spanish plural particle chains ("de los", "de las")', () => {
  // The Spanish multi-word given names "<First> de los <Surname>" and
  // "<First> de las <Surname>" — e.g. "Maria de los Angeles", "Jorge de las
  // Mercedes" — were truncating because "los" and "las" were missing from the
  // PARTICLES set. The chain extended through "de" but then died on the
  // unrecognized plural article. Adding both tokens lets the run-of-particles
  // extension cross the connector for held-out names that are NOT in the DB,
  // proving the fix is a heuristic — not a dictionary addition.
  it('chains "de los" across a held-out compound name', () => {
    expect(persons('Mrs. Aurelienne de los Zwingenberger called yesterday.')).toContain(
      'Aurelienne de los Zwingenberger'
    );
  });

  it('chains "de las" across a held-out compound name', () => {
    expect(persons('Engineer Marquezino de las Fitzgerlandsen approved the refund.')).toContain(
      'Marquezino de las Fitzgerlandsen'
    );
  });

  it('does not turn "de los"/"de las" + structural noun into a person', () => {
    // Mirrors the existing "van der Department" / "de la Invoice" precision
    // guard: the structural-noun (`isNonNameWord`) block in the chain-extension
    // path must still trip across the new plural connectors.
    expect(persons('Account holder Tomasz de los Department closed early.')).not.toContain(
      'Tomasz de los Department'
    );
    expect(persons('Customer Maria de las Invoice was reviewed.')).not.toContain(
      'Maria de las Invoice'
    );
  });

  it('proves the Spanish-particle held-out names are absent from the full DB', () => {
    // Uses the FULL committed dictionary (curated `core` + ingested `ext`) so a
    // future bulk-ingest that adds any of these tokens trips the check and
    // forces a fresh held-out pair — otherwise the detection cases above stop
    // proving the heuristic and start riding the dictionary.
    const fullSource = nameSourceFromBuildInputs();
    const heldOut: Array<[string, 'Latin']> = [
      ['aurelienne', 'Latin'],
      ['zwingenberger', 'Latin'],
      ['marquezino', 'Latin'],
      ['fitzgerlandsen', 'Latin'],
    ];
    for (const [word, script] of heldOut) {
      expect(fullSource.hasGiven(word, script), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, script), `${word} should be out-of-DB`).toBe(false);
    }
  });
});

describe('handoff-verb frame ("<verb> to <Name>")', () => {
  // The cue ("Escalated to ...", "forwarded to ...", "Assigned to ...") sits TWO
  // tokens before the name, beyond the existing one-token role-noun lookback.
  // Verified against the FULL committed dictionary so the names below are
  // genuinely held out — detection rides on the handoff-frame heuristic, never
  // on dictionary membership.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an unknown name after a sentence-initial handoff verb + "to"', () => {
    expect(personsFull('Escalated to Göran Andström for review.')).toContain('Göran Andström');
    expect(personsFull('Forwarded to Qwesterveldt Brakkenzoon yesterday.')).toContain(
      'Qwesterveldt Brakkenzoon'
    );
  });

  it('detects an unknown name after a mid-sentence handoff verb + "to"', () => {
    expect(personsFull('Ticket was referred to Wlodimar Krimbleton today.')).toContain(
      'Wlodimar Krimbleton'
    );
    expect(personsFull('The case was assigned to Vexbruck Hollvardsen last week.')).toContain(
      'Vexbruck Hollvardsen'
    );
  });

  it('covers the common past-tense handoff verbs (closed set)', () => {
    // One representative case per verb, all using the same held-out name pair so
    // the test isolates the verb-trigger from name-specific quirks.
    const name = 'Qwesterveldt Brakkenzoon';
    for (const verb of [
      'escalated',
      'forwarded',
      'routed',
      'transferred',
      'reassigned',
      'redirected',
      'assigned',
      'referred',
      'handed',
      'delegated',
    ]) {
      expect(personsFull(`The case was ${verb} to ${name} for review.`)).toContain(name);
    }
  });

  it('does not fire on structural-noun chains (precision guard)', () => {
    // The role-cue scoring (parts >= 2 + NON_NAME_WORDS guard) carries over: a
    // structural-noun chain after the handoff cue must not become a person.
    expect(personsFull('Escalated to Customer Service Team for review.')).toHaveLength(0);
    expect(personsFull('Forwarded to Compliance Department this morning.')).toHaveLength(0);
    expect(personsFull('Routed to Service Desk overnight.')).toHaveLength(0);
  });

  it('does not fire on a single token after the handoff cue', () => {
    // parts === 1 + roleBefore alone never clears the threshold; a lone
    // capitalized word after "to" (a city, a weekday, a label) must not promote.
    expect(personsFull('Escalated to Berlin overnight.')).toHaveLength(0);
    expect(personsFull('Assigned to Friday.')).toHaveLength(0);
  });

  it('does not fire on imperative/structural verb frames (closed set guard)', () => {
    // The cue is a closed set of past-tense handoff verbs, not a general
    // "verb + to" rule, so unrelated frames must remain untouched. Each
    // negative below proves the verb itself is the gate: the same target
    // ("Default Settings", "Admin Console") would chain under a handoff verb
    // if "Reset" / "Login" leaked into the cue set.
    expect(personsFull('Reset to Default Settings completed.')).toHaveLength(0);
    expect(personsFull('Login to Admin Console required.')).toHaveLength(0);
  });

  it('proves the handoff-frame names are held out (absent from the full DB)', () => {
    // The fix is the two-token handoff lookback, not memorization: if any of
    // these land in the DB later, the cases above stop proving generalization —
    // re-point them at fresh held-outs.
    const heldOut = [
      'göran',
      'andström',
      'qwesterveldt',
      'brakkenzoon',
      'wlodimar',
      'krimbleton',
      'vexbruck',
      'hollvardsen',
    ];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });
});

describe('handoff-verb frame — German ("<Verb> an <Name>")', () => {
  // German telegraphic ticket style ("Eskaliert an …", "Zugewiesen an …"). The
  // connector is "an", paired ONLY with German routing verbs — never the English
  // "to" — so the multilingual cue layer rescues out-of-DB names inside a German
  // frame, not just an English one. Held out against the FULL committed dictionary
  // (the held-out proof for these names lives in the English block above).
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an unknown name after a sentence-initial German handoff verb + "an"', () => {
    // Trailing word stays lowercase/non-particle so the chain ends at the surname
    // (a capitalized word after the nobiliary particle "zur"/"zu" would extend it —
    // a pre-existing particle behaviour, unrelated to the handoff frame).
    expect(personsFull('Eskaliert an Qwesterveldt Brakkenzoon gestern.')).toContain(
      'Qwesterveldt Brakkenzoon'
    );
    expect(personsFull('Weitergeleitet an Wlodimar Krimbleton heute.')).toContain(
      'Wlodimar Krimbleton'
    );
  });

  it('detects an unknown name after a mid-sentence German handoff verb + "an"', () => {
    expect(personsFull('Der Vorgang wurde übergeben an Vexbruck Hollvardsen heute.')).toContain(
      'Vexbruck Hollvardsen'
    );
  });

  it('covers the common German handoff verbs (closed set)', () => {
    const name = 'Qwesterveldt Brakkenzoon';
    for (const verb of [
      'eskaliert',
      'weitergeleitet',
      'weitergegeben',
      'übergeben',
      'zugewiesen',
      'umgeleitet',
      'weitergereicht',
      'delegiert',
      'verwiesen',
      'überwiesen',
    ]) {
      expect(personsFull(`Der Vorgang wurde ${verb} an ${name}.`)).toContain(name);
    }
  });

  it('does not fire on German structural-noun chains (precision guard)', () => {
    expect(personsFull('Weitergeleitet an Kundenservice Team heute.')).toHaveLength(0);
    expect(personsFull('Eskaliert an Buchhaltung Zentrale morgen.')).toHaveLength(0);
  });

  it('does not fire on cross-language verb/connector mixes', () => {
    // The pairing is load-bearing: an English handoff verb with the German "an"
    // (here the English article) is not a frame, and a German verb with "to" is
    // not a frame either. Both targets are held-out two-token candidates that
    // WOULD chain if the frame matched — so a non-detection proves the gate.
    expect(personsFull('Delegated an Qwesterveldt Brakkenzoon today.')).toHaveLength(0);
    expect(personsFull('Eskaliert to Vexbruck Hollvardsen now.')).toHaveLength(0);
  });

  it('does not fire on a single token after the German cue', () => {
    expect(personsFull('Eskaliert an Berlin gestern.')).toHaveLength(0);
  });
});

describe('source-noun frame ("<noun> from <Name>")', () => {
  // The cue is a CLOSED set of origin-of-message nouns ("Complaint from …",
  // "Email from …", "Letter from …") sitting two tokens before the name —
  // parallel to the handoff-verb frame above but for the *source* of contact
  // rather than its destination. Verified against the FULL committed
  // dictionary so the names below are genuinely held out: detection rides on
  // the source-frame heuristic, never on dictionary membership.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an unknown name after a sentence-initial source noun + "from"', () => {
    // The exact gap that motivated this heuristic (see issue: "Complaint from
    // Sven Larsson"). "Sven" is absent from the full DB; the chain anchors on
    // the source-frame cue, not on any one-token dictionary hit.
    expect(personsFull('Complaint from Qwesterveldt Brakkenzoon regarding refund.')).toContain(
      'Qwesterveldt Brakkenzoon'
    );
    expect(personsFull('Letter from Wlodimar Krimbleton arrived yesterday.')).toContain(
      'Wlodimar Krimbleton'
    );
  });

  it('detects an unknown name after a mid-sentence source noun + "from"', () => {
    expect(personsFull('We received an inquiry from Vexbruck Hollvardsen this morning.')).toContain(
      'Vexbruck Hollvardsen'
    );
    expect(personsFull('Logged a call from Göran Andström last night.')).toContain(
      'Göran Andström'
    );
  });

  it('covers the common English source nouns (closed set)', () => {
    // One representative case per noun, all using the same held-out name pair
    // so the test isolates the noun-trigger from name-specific quirks.
    const name = 'Qwesterveldt Brakkenzoon';
    for (const noun of [
      'Complaint',
      'Inquiry',
      'Enquiry',
      'Request',
      'Message',
      'Email',
      'Mail',
      'Letter',
      'Note',
      'Notes',
      'Call',
      'Report',
      'Submission',
      'Feedback',
      'Response',
      'Reply',
      'Query',
      'Update',
      'Notice',
      'Notification',
    ]) {
      expect(personsFull(`${noun} from ${name} arrived.`)).toContain(name);
    }
  });

  it('does not fire on structural-noun chains (precision guard)', () => {
    // NON_NAME_WORDS still breaks the chain after the source cue — same path
    // that protects the handoff frame from "Customer Service Team" / "Service
    // Desk" / "Compliance Department".
    expect(personsFull('Notification from Customer Service Team this morning.')).toHaveLength(0);
    expect(personsFull('Update from Finance Department overnight.')).toHaveLength(0);
    expect(personsFull('Message from Support Desk follows.')).toHaveLength(0);
  });

  it('does not fire on a single token after the source cue', () => {
    // parts === 1 + roleBefore alone never clears 0.5; a lone capitalized word
    // after "from" (a city, a weekday) must not promote. The existing
    // ext-only single-token penalty in scoreName is the gate.
    expect(personsFull('Letter from London arrived yesterday.')).toHaveLength(0);
    expect(personsFull('Email from Berlin overnight.')).toHaveLength(0);
    expect(personsFull('Update from Friday follows.')).toHaveLength(0);
  });

  it('does not fire on imperative / unrelated noun frames (closed set guard)', () => {
    // The cue is a closed set of origin-of-message nouns, not a general
    // "noun + from" rule, so causal / spatial frames must remain untouched.
    // Each negative below uses a held-out two-token candidate that WOULD chain
    // if the noun leaked into the cue set — a non-detection proves the gate.
    expect(personsFull('Distance from Qwesterveldt Brakkenzoon is large.')).toHaveLength(0);
    expect(personsFull('Order from Wlodimar Krimbleton was cancelled.')).toHaveLength(0);
    expect(personsFull('Result from Vexbruck Hollvardsen testing pending.')).toHaveLength(0);
  });

  it('proves the source-frame names are held out (absent from the full DB)', () => {
    // The fix is the two-token source lookback, not memorization: if any of
    // these land in the DB later, the cases above stop proving generalization —
    // re-point them at fresh held-outs.
    const heldOut = [
      'qwesterveldt',
      'brakkenzoon',
      'wlodimar',
      'krimbleton',
      'vexbruck',
      'hollvardsen',
      'göran',
      'andström',
    ];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });
});

describe('source-noun frame — German ("<Substantiv> von <Name>")', () => {
  // German telegraphic style ("Beschwerde von …", "Bericht von …"). The
  // connector is "von", paired ONLY with German source nouns — never the
  // English "from" — mirroring the handoff frame's same-language rule.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an unknown name after a German source noun + "von"', () => {
    expect(personsFull('Beschwerde von Wlodimar Krimbleton heute eingegangen.')).toContain(
      'Wlodimar Krimbleton'
    );
    expect(personsFull('Bericht von Qwesterveldt Brakkenzoon übermittelt.')).toContain(
      'Qwesterveldt Brakkenzoon'
    );
  });

  it('covers the common German source nouns (closed set)', () => {
    const name = 'Qwesterveldt Brakkenzoon';
    for (const noun of [
      'Beschwerde',
      'Anfrage',
      'Nachricht',
      'Email',
      'Brief',
      'Notiz',
      'Anruf',
      'Bericht',
      'Rückmeldung',
      'Antwort',
      'Mitteilung',
      'Meldung',
      'Feedback',
    ]) {
      expect(personsFull(`${noun} von ${name} eingegangen.`)).toContain(name);
    }
  });

  it('does not fire on cross-language noun/connector mixes', () => {
    // The pairing is load-bearing: an English source noun with the German
    // "von" (or vice versa) is not a frame. Both targets are held-out
    // two-token candidates that WOULD chain if the frame matched — so a
    // non-detection proves the gate.
    expect(personsFull('Update von Qwesterveldt Brakkenzoon heute.')).toHaveLength(0);
    expect(personsFull('Beschwerde from Vexbruck Hollvardsen now.')).toHaveLength(0);
  });

  it('does not fire on a single token after the German source cue', () => {
    expect(personsFull('Beschwerde von Berlin gestern.')).toHaveLength(0);
  });
});

describe('role-noun apposition — German ("<Rolle> <Name>")', () => {
  // German role nouns are capitalized common nouns; the lookup lowercases, so the
  // existing one-token role-cue path generalizes to "Kundin <Name>" the same way
  // it does to "Account holder <Name>". Names held out against the full dictionary.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an unknown full name after a German role noun', () => {
    expect(personsFull('Kundin Qwesterveldt Brakkenzoon hat bezahlt.')).toContain(
      'Qwesterveldt Brakkenzoon'
    );
    expect(personsFull('Sachbearbeiter Wlodimar Krimbleton prüft den Fall.')).toContain(
      'Wlodimar Krimbleton'
    );
  });

  it('does not promote a structural-noun phrase after a German role noun', () => {
    // NON_NAME_WORDS (DE) blocks the chain just as it does on the English path.
    expect(personsFull('Kunde Konto Nummer wurde geändert.')).toHaveLength(0);
    expect(personsFull('Mandant Rechnung Vorgang ist offen.')).toHaveLength(0);
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

describe('title/role-anchored particle start (no leading given name)', () => {
  // "Dr. van der Berg", "Ms. de Vries": a title or role cue sits immediately
  // before a particle that leads into a capitalized surname, with NO given name
  // in between. The chain must begin on the lowercase particle so the title/role
  // boost is kept; otherwise it can only start at the bare surname, which scores
  // below threshold and is dropped. Verified against the FULL committed dictionary
  // so the surnames below are genuinely held out — detection rides on the
  // particle-start heuristic, never on dictionary membership.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('starts a held-out surname on a particle after a title', () => {
    expect(personsFull('Dr. van der Vandermeerux arrived today.')).toContain(
      'van der Vandermeerux'
    );
    expect(personsFull('Ms. de Brakkenzoon signed the form.')).toContain('de Brakkenzoon');
  });

  it('starts a held-out surname on a particle after a role cue', () => {
    expect(personsFull('Engineer de Hollvardsen reviewed the ticket.')).toContain('de Hollvardsen');
    expect(personsFull('Account holder van Krimbleton was notified.')).toContain('van Krimbleton');
  });

  it('proves the surnames are held out (absent from the full DB)', () => {
    const heldOut = ['vandermeerux', 'brakkenzoon', 'hollvardsen', 'krimbleton'];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('does not fire when the particle leads into a structural noun', () => {
    expect(personsFull('Dr. van der Department escalated this.')).toHaveLength(0);
    expect(personsFull('Engineer de Service confirmed the order.')).toHaveLength(0);
  });

  it('does not start a name on a particle without a title or role cue', () => {
    expect(personsFull('they van der Vandermeerux walked in.')).toHaveLength(0);
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

describe('precomposed Latin folding (Nordic ø/æ, Polish ł, German ß, Icelandic ð/þ, Turkish ı)', () => {
  // NFD already handles every letter+diacritic pair that decomposes (é, ñ, ü, å),
  // but a handful of historic ligatures and stroked letters are atomic codepoints
  // with no decomposition: ø, æ, œ, ß, ł, ð, þ, ı. Without an explicit fold the
  // exact same Census/Wikidata names that already ship in ASCII form ("jorgensen",
  // "lukasz", "reuss") are unreachable from real prose that writes them natively.
  // Verified against the FULL committed dictionary so each surface form is
  // genuinely absent — detection rides on the fold, not on dictionary membership.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects a Nordic ø-name as part of a chain (Bjørn Helgø)', () => {
    expect(personsFull('We escalated the case to Engineer Bjørn Helgø last Tuesday.')).toContain(
      'Bjørn Helgø'
    );
  });

  it('detects a Polish ł-surname after a role cue (Anna Mały)', () => {
    expect(personsFull('Engineer Anna Mały filed the report.')).toContain('Anna Mały');
  });

  it('detects a German ß-surname after a role cue (Heinrich Reuß)', () => {
    expect(personsFull('Customer Heinrich Reuß reported the issue.')).toContain('Heinrich Reuß');
  });

  it('proves the detections are held out: the precomposed forms are absent from the full DB', () => {
    // Folding is the lever, not dictionary membership. If a precomposed entry is
    // added later under its native spelling, re-point these at fresh held-outs.
    for (const word of ['bjørn', 'helgø', 'mały', 'reuß', 'sørensen', 'koziół']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('generalizes to any name: an unseen ø-spelling folds to a fixture core entry', () => {
    // The fixture knows only the ASCII key "qwertson"; the precomposed surface
    // form "Qwørtsøn" is never added (raw membership is false), yet folding
    // recovers it. Same heuristic, independent of which names exist in production.
    const fixture = new PackNameSource();
    fixture.addWords(['qwertson'], { script: 'Latin', tier: 'core' }, 'latin-core');
    expect(fixture.hasFamily('qwørtsøn', 'Latin')).toBe(false);
    const found = detect('Please ask Dr. Qwørtsøn about it.', { nameSource: fixture })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);
    expect(found).toContain('Qwørtsøn');
  });

  it('does not turn Nordic non-name vocabulary into people (precision guard)', () => {
    // "Pølse" / "Tøj" / "Smør" fold to "polse" / "toj" / "smor", none of which
    // are in the DB; their capitalized neighbours are structural or absent too,
    // so no chain forms. Proves the fold is just a lookup mapping — the existing
    // NON_NAME_WORDS / single-token / chain guards still gate detection.
    expect(personsFull('Bestilling: Pølse Festival fredag aften.')).toHaveLength(0);
    expect(personsFull('Tøj og Smør findes i butikken.')).toHaveLength(0);
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

  it('does not chain an ext given name onto a digit-adjacent identifier prefix', () => {
    // Real production bug: "IBAN" is an ext-tier given name (Basque "Iban"); a
    // typo'd / invalid-checksum IBAN like "CZ6508 0000 1234 ..." leaves the
    // structured detector silent, and the name detector then chained "IBAN" + a
    // capitalized 2-letter country code into a fake PERSON ("IBAN CZ"). The
    // generalizing fix: a Latin name candidate fused (no whitespace) to a
    // following digit run is a structured-identifier fragment, not a name part.
    // Held-out: the country codes below are NOT in the full committed
    // dictionary, so detection rides on the digit-adjacency heuristic, not on
    // membership.
    // First word is chosen to NOT itself be a dictionary hit, so the test
    // isolates the digit-adjacency lever — no other anchor pathway perturbs it.
    expect(personsFull('Confirmed IBAN CZ6508 0000 1234 5678 9012 34.')).toHaveLength(0);
    expect(personsFull('Requested IBAN PT50 0001 0051 0505 0105 0105 today.')).toHaveLength(0);
    // Generalizes beyond IBANs: any letter-prefix fused to digits ("XR250",
    // "QZ7841") cannot anchor or extend a name chain, regardless of vocabulary.
    expect(personsFull('Asset XR250-A escalation pending.')).toHaveLength(0);
    expect(personsFull('Reference QZ7841 is invoice QZ7842-0001.')).toHaveLength(0);
  });

  it('proves the digit-adjacency guard does not memorize the country codes', () => {
    // If any of these land in the DB later, re-point at fresh held-outs.
    for (const word of ['cz', 'pt', 'gb', 'qz', 'xr']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('precision: real names near digits with whitespace are still detected', () => {
    // The guard only fires on fused letter-then-digit; whitespace is enough to
    // make a token a real word again.
    expect(personsFull('Customer Marcus Wilson called 5 times.')).toContain('Marcus Wilson');
    expect(personsFull('Dr Smith reviewed case 1234 today.')).toContain('Dr Smith');
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
