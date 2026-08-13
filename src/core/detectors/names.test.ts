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

describe('apostrophe-elided surnames ("d\'Arcy", "l\'Anglais")', () => {
  // Anglo-Norman / French surnames the ingest sources index by their solid,
  // apostrophe-elided spelling ("darcy", "death", "langlais") — NOT by the
  // post-particle root ("arcy", "eath", "anglais"). The surface token also
  // carries a lowercase particle letter ("d", "l"), so it fails the plain
  // capitalization gate. Both are handled together: `apostropheRoots` probes the
  // elided form as well as the post-particle root, and `particleApostropheName`
  // treats the lowercase-particle-plus-Cap-tail shape as a name token — the
  // apostrophe sibling of the existing "al-Rashid" hyphen-particle handling.
  //
  // Everything below is held out against the FULL committed DB (core + ext):
  // the surface forms and the post-particle roots are all absent, so detection
  // can only come from the elided-form heuristic, never from memorizing the
  // surface token.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an unknown given before an elided apostrophe surname (backward anchor)', () => {
    // "death" / "langlais" are ext-tier; "eath" / "anglais" (the post-particle
    // root the old lookup tried) are absent. Before the fix these dropped
    // silently while the equally ext solid forms ("Vitya Death") detected.
    expect(personsFull("Vitya d'Eath requested a refund.")).toContain("Vitya d'Eath");
    expect(personsFull("Wojciech l'Anglais arrived this morning.")).toContain("Wojciech l'Anglais");
  });

  it('detects an elided apostrophe surname after a role cue', () => {
    expect(personsFull("Engineer Vitya d'Eath resolved the ticket.")).toContain("Vitya d'Eath");
  });

  it('stays DB-gated: a non-name apostrophe token is not swept in', () => {
    // Same shape, but neither the elided form nor the post-particle root is a
    // known name, so without a title/role licence the chain must not promote —
    // proving the rescue is a dictionary lookup, not blanket shape acceptance.
    expect(personsFull("Vitya d'Zzuk requested a refund.")).toHaveLength(0);
    expect(personsFull("Wojciech l'Zzax arrived this morning.")).toHaveLength(0);
  });

  it('proves the elided held-out surnames are absent in surface + root form', () => {
    // Surface ("d'eath") and post-particle root ("eath") MUST be out-of-DB, so
    // the detections above rely solely on the elided solid form ("death").
    const absent: Array<[string, 'Latin']> = [
      ["d'eath", 'Latin'],
      ['eath', 'Latin'],
      ["l'anglais", 'Latin'],
      ['anglais', 'Latin'],
    ];
    for (const [word, script] of absent) {
      expect(fullSource.hasGiven(word, script), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, script), `${word} should be out-of-DB`).toBe(false);
    }
    // ...while the elided solid forms the heuristic maps onto ARE present (ext).
    expect(fullSource.matchTier('death', 'Latin')).toBe('ext');
    expect(fullSource.matchTier('langlais', 'Latin')).toBe('ext');
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

describe('backward unknown-cap anchor ("<unknown given> <ext surname>")', () => {
  // Symmetric backward case of the forward unknown-cap chain extension. The
  // forward path already accepts an unknown surname after a known given
  // ("Anna Kuznetsova" — Anna anchors, Kuznetsova is absorbed). Until this
  // rule landed, the mirror case dropped silently: an unknown GIVEN before a
  // known surname could not anchor the chain, and a single ext-tier surname
  // on its own scores below threshold ( 0.6 − 0.2 extOnly penalty = 0.4 ),
  // so the entire name was lost — exposing every language whose given table
  // is sparse but whose surnames are in the long-tail (`ext`) bulk.
  //
  // Detection here MUST come from the heuristic, never from membership: the
  // given-name tokens are held out against the FULL committed DB (curated
  // core + ingested ext) below.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an unknown given before an ext-tier surname at sentence start', () => {
    // Vitya — Russian diminutive of Viktor, absent from the DB. Volkov — ext.
    expect(personsFull('Vitya Volkov requested a refund.')).toContain('Vitya Volkov');
    // Wojciech — common Polish given, absent. Lindqvist — ext.
    expect(personsFull('Wojciech Lindqvist arrived this morning.')).toContain('Wojciech Lindqvist');
  });

  it('detects the unknown given even mid-sentence (no sentence-start dependency)', () => {
    expect(personsFull('Regarding Vitya Volkov, please respond.')).toContain('Vitya Volkov');
  });

  it('does not detect when the corroborator is also out of the DB', () => {
    // Both halves unknown — without a DB-confirmed corroborator the chain has
    // no anchor, so we must NOT promote either token.
    expect(personsFull('Aiyana Standingbear filed a claim.')).toHaveLength(0);
    expect(personsFull('Zzzaard Qqqulev submitted the form.')).toHaveLength(0);
  });

  it('does not promote a sentence-opener verb before a known name', () => {
    // The candidate filter rejects clause-leading imperatives. Without the
    // openers extension these would slurp the following name into a single FP
    // span ("Email Volkov today" → "Email Volkov").
    expect(personsFull('Email Volkov today about the refund.')).not.toContain('Email Volkov');
    expect(personsFull('Visit Petrenko before the meeting ends.')).not.toContain('Visit Petrenko');
    expect(personsFull('Meet Lindqvist at the lobby this afternoon.')).not.toContain(
      'Meet Lindqvist'
    );
  });

  it('does not promote a core-tier given name as the corroborator', () => {
    // "Email John Smith" must remain a clean detection of "John Smith" only,
    // never "Email John Smith". The corroborator-tier gate (ext-only) is the
    // precision lever: common Anglo names are core, so "<imperative verb> +
    // <core given name>" never anchors via this rule.
    expect(personsFull('Email John Smith and also before noon.')).toEqual(['John Smith']);
    expect(personsFull('Visit Anna at the cafe.')).toEqual(['Anna']);
    expect(personsFull('Reach Michael Anderson today.')).toEqual(['Michael Anderson']);
  });

  it('does not promote a structural noun + ext-tier corroborator', () => {
    // The candidate cannot be a non-name word (NON_NAME_WORDS) — keeps
    // "Customer Service Team" / "Account Approval Form" untouched. The
    // corroborator's non-name filter additionally blocks product-shape
    // chains like "Admin Console" (console is technical UI vocab in ext).
    expect(personsFull('Customer Service Team responded quickly.')).toHaveLength(0);
    expect(personsFull('Login to Admin Console required.')).toHaveLength(0);
    expect(personsFull('Status Update queued for processing.')).toHaveLength(0);
  });

  it('does not promote when the corroborator is in AMBIGUOUS_WORDS', () => {
    // English "frank" lands in the DB at ext-tier and is also ordinary
    // vocabulary, so it could anchor an "<unknown cap> <ambiguous ext>" chain
    // (the candidate would otherwise sail through the precision filters). The
    // corroborator's ambiguous-word filter blocks that promotion path — the
    // unknown candidate is held out from the full DB, so any detection here
    // would have to come from this rule alone.
    expect(personsFull('Zzzaard Frank arrived at the office.')).toHaveLength(0);
  });

  it('proves the backward-anchor held-out names are absent from the full DB', () => {
    const heldOut: Array<[string, 'Latin']> = [
      ['vitya', 'Latin'],
      ['wojciech', 'Latin'],
      ['aiyana', 'Latin'],
      ['standingbear', 'Latin'],
      ['zzzaard', 'Latin'],
      ['qqqulev', 'Latin'],
    ];
    for (const [word, script] of heldOut) {
      expect(fullSource.hasGiven(word, script), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, script), `${word} should be out-of-DB`).toBe(false);
    }
    // And the corroborators that license detection MUST be present in the
    // committed DB at `ext` tier — the rule rescues exactly the population
    // where the surname is ext-tier (and would otherwise score below
    // threshold on its own).
    expect(fullSource.matchTier('volkov', 'Latin')).toBe('ext');
    expect(fullSource.matchTier('lindqvist', 'Latin')).toBe('ext');
  });
});

describe('structural role noun after a name is not absorbed as a surname', () => {
  // "Manager", "Director", "Lead", "Head", "Chief" are real ext-tier census
  // surnames AND structural role nouns (NON_NAME_WORDS). When one follows a
  // given name in prose ("Sarah Manager reviewed it"), the DB hit used to let
  // the chain absorb the role noun and emit a two-token PERSON span. The
  // chain-extension guard now breaks on any NON_NAME_WORD regardless of DB
  // membership, so only the real given name is emitted.
  //
  // Held out from the fix's corpus cases (Sarah/Anna): the role nouns below
  // pair with DIFFERENT given names, proving the guard generalizes rather than
  // memorizing the two benchmarked strings. Uses the FULL committed DB so the
  // role nouns are genuine ext-tier hits (asserted at the end) — the guard,
  // not absence from the dictionary, is what stops the absorption.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('emits only the given name, not "<Given> <RoleNoun>"', () => {
    // All givens are core-tier, so each detects on its own (0.65) once the
    // guard stops the chain from swallowing the trailing role noun.
    expect(personsFull('Michael Manager reviewed the ticket.')).toEqual(['Michael']);
    expect(personsFull('David Director signed the form.')).toEqual(['David']);
    expect(personsFull('Thomas Lead handled the escalation.')).toEqual(['Thomas']);
    expect(personsFull('Robert Head confirmed the refund.')).toEqual(['Robert']);
    expect(personsFull('James Chief approved the request.')).toEqual(['James']);
  });

  it('still detects a genuine two-token name (guard is noun-specific)', () => {
    // Same shape, but the second token is a real surname, not a structural
    // noun — the chain must still extend.
    expect(personsFull('Michael Anderson reviewed the ticket.')).toContain('Michael Anderson');
  });

  it('proves the role nouns are genuine ext-tier DB hits (guard, not membership)', () => {
    for (const noun of ['manager', 'director', 'lead', 'head', 'chief']) {
      const hit = fullSource.hasGiven(noun, 'Latin') || fullSource.hasFamily(noun, 'Latin');
      expect(hit, `${noun} should be in the committed DB`).toBe(true);
    }
  });
});

describe('number-abbreviation label guard ("<Label> No./Nr./Nº <id>")', () => {
  // Support / KYC / CRM prose labels an identifier with the "number"
  // abbreviation — "Passport No. A2B4D7K9", "Account Nr. 55-01", "Serial Nº
  // 7788". "No"/"Nr" also sit in the long-tail ext surname list (Korean/
  // Vietnamese "No"), so the backward unknown-cap anchor read the abbreviation
  // as a surname and dragged the preceding structural noun in with it, emitting
  // a false PERSON span ("Passport No", "Account Nr"). The fix recognises the
  // abbreviation structurally (letters + trailing '.', or the °-ligature), never
  // by dictionary membership.
  const fullSource2 = nameSourceFromBuildInputs();
  const personsFull2 = (text: string) =>
    detect(text, { nameSource: fullSource2 })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('does not read a "<Label> No./Nr./Nº <id>" abbreviation as a name', () => {
    // Held-out label nouns (none is a name) prove the guard generalizes beyond
    // the one "Passport No." case that surfaced it.
    expect(personsFull2('Passport No. A2B4D7K9 provided by customer.')).toHaveLength(0);
    expect(personsFull2('Account No. 4471-AA on file.')).toHaveLength(0);
    expect(personsFull2('Serial No. ZQ8871 reported by the team.')).toHaveLength(0);
    expect(personsFull2('Docket Nr. 55-01 was escalated.')).toHaveLength(0);
    expect(personsFull2('Reference Nº 7788 pending review.')).toHaveLength(0);
  });

  it('does not absorb a trailing number label into a real name chain', () => {
    // The label follows a genuine given name; only the name must survive.
    expect(personsFull2('Customer Priya No. 4471 was verified.')).not.toContain('Priya No');
  });

  it('still detects a real "No" surname when it is not the abbreviation', () => {
    // No trailing dot → the ext-tier surname "No" is a real name part, so the
    // guard leaves the chain intact. Held out from the DB: "Kevin" is core, the
    // detection rides on the "<given> <ext surname>" chain, not on this rule.
    expect(personsFull2('Kevin No called about the outage.')).toContain('Kevin No');
  });

  it('proves the label nouns are absent from the DB and "No" is a real ext surname', () => {
    // The guard is structural, not vocabulary: the label nouns are NOT in the
    // committed dictionary, so a surviving span could only come from "No"/"Nr"
    // being read as the ext surname it genuinely is.
    for (const w of ['passport', 'account', 'serial', 'docket', 'reference']) {
      expect(fullSource2.hasGiven(w, 'Latin'), `${w} should be out-of-DB`).toBe(false);
      expect(fullSource2.hasFamily(w, 'Latin'), `${w} should be out-of-DB`).toBe(false);
    }
    expect(fullSource2.matchTier('no', 'Latin')).toBe('ext');
  });
});

describe('role cue with label colon ("<RoleNoun>: <Name>")', () => {
  // Ticket / log / form prose introduces a name with a label colon after the
  // role noun ("Engineer: Per Aarvik", "Customer: Mary Jones",
  // "Account holder: Bob Davis"). The colon was rejected by the whitespace-only
  // SINGLE_GAP, so any out-of-DB name in this position was dropped. Detection
  // here must ride only on the role cue + 2 parts, never on dictionary
  // membership — names below are held out via the FULL committed DB.
  it('detects an unknown full name after a role noun + colon', () => {
    expect(persons('Engineer: Praxworth Fnordlinger resolved the ticket.')).toContain(
      'Praxworth Fnordlinger'
    );
    expect(persons('Customer: Glimwald Pendlemoor called the hotline.')).toContain(
      'Glimwald Pendlemoor'
    );
  });

  it('detects an unknown full name after a compound role label + colon', () => {
    // "Account holder" + colon — the role noun is the SECOND token of a
    // descriptor; only the immediate role token before the candidate matters.
    expect(persons('Account holder: Fingleton Bazlovic disputed the charge.')).toContain(
      'Fingleton Bazlovic'
    );
  });

  it('also accepts the abbreviated role + colon ("Eng.:" / "Eng:")', () => {
    expect(persons('Eng: Praxworth Glimwald approved the change.')).toContain('Praxworth Glimwald');
  });

  it('does not promote a single capitalized word after a role label colon', () => {
    // Mirrors the existing parts === 1 + roleBefore guard: a lone capitalized
    // word after the colon must not clear the threshold (no second name part
    // to corroborate, no DB hit).
    expect(persons('Status: Pending review of the order.')).toHaveLength(0);
    expect(persons('Customer: Acme submitted the form.')).toHaveLength(0);
  });

  it('does not turn a role label colon + structural nouns into a person', () => {
    // NON_NAME_WORDS still blocks the structural follow-on — the colon path is
    // additive over the existing role-cue precision guard.
    expect(persons('Customer: Service Team responded quickly.')).toHaveLength(0);
    expect(persons('Engineer: Final Review is pending.')).toHaveLength(0);
  });

  it('does not let a full role word + period (sentence boundary) start a name via the colon path', () => {
    // The new gap admits ONLY colon, not period — so the existing
    // sentence-boundary guard remains intact.
    expect(persons('Please notify the duty engineer. Daily Briefing follows.')).toHaveLength(0);
  });

  it('proves the role-label-colon held-out names are absent from the full DB', () => {
    const fullSource = nameSourceFromBuildInputs();
    const heldOut: Array<[string, 'Latin']> = [
      ['praxworth', 'Latin'],
      ['fnordlinger', 'Latin'],
      ['glimwald', 'Latin'],
      ['pendlemoor', 'Latin'],
      ['fingleton', 'Latin'],
      ['bazlovic', 'Latin'],
    ];
    for (const [word, script] of heldOut) {
      expect(fullSource.hasGiven(word, script), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, script), `${word} should be out-of-DB`).toBe(false);
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

describe('title/role-anchored particle-hyphen start (joined "al-Surname")', () => {
  // The tokenizer glues "al-Rashid", "el-Sayyid", "abu-Yusuf" into a single
  // lowercase-initial token (head = particle, tail = capitalized). Without a
  // particle-hyphen branch in nameStart the candidate fails the capitalization
  // check, so a chain whose FIRST token is such a surname is dropped even when
  // a strong title/role cue precedes it ("customer al-Rashid al-Makki ..."). The
  // branch only fires when (a) a cue precedes the candidate AND (b) a real
  // continuation follows — same triple guard as the bare-particle branch, so a
  // single particle-hyphen token after a cue, a structural follow-on, and a
  // missing cue all stay non-detections. Verified against the FULL committed
  // dictionary so the surnames below are genuinely held out — detection rides
  // on the particle-hyphen-start heuristic, never on dictionary membership.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('starts a held-out particle-hyphen surname after a role cue', () => {
    expect(personsFull('Customer al-Brakkenzoon al-Vandermeerux confirmed.')).toContain(
      'al-Brakkenzoon al-Vandermeerux'
    );
    expect(personsFull('Engineer el-Hollvardsen Krimbleton reviewed the case.')).toContain(
      'el-Hollvardsen Krimbleton'
    );
  });

  it('starts a held-out particle-hyphen surname after a title', () => {
    expect(personsFull('Dr. abu-Brakkenzoon Vandermeerux signed the form.')).toContain(
      'abu-Brakkenzoon Vandermeerux'
    );
  });

  it('proves the particle-hyphen surnames are held out (absent from the full DB)', () => {
    // The fix is the new start branch, not memorization: if any of these land in
    // the DB later the test trips and a fresh held-out pair must be picked.
    const heldOut = ['brakkenzoon', 'vandermeerux', 'hollvardsen', 'krimbleton'];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('does not fire on a single particle-hyphen token after the cue (no continuation)', () => {
    // Precision guard for today's gap-report shape: "Customer al-Rashid confirms ..."
    // — the cue is there but nothing corroborates the name, so a chain on parts === 1
    // would FP on "Customer al-Hambra reserved ..." / "Engineer al-Capitan finalized
    // ...". The nameContinuation requirement keeps it out.
    expect(personsFull('Customer al-Brakkenzoon confirmed the order.')).toHaveLength(0);
    expect(personsFull('Engineer el-Hollvardsen replied yesterday.')).toHaveLength(0);
  });

  it('does not fire when the particle-hyphen leads into a structural noun', () => {
    expect(personsFull('Customer al-Brakkenzoon Department escalated this.')).toHaveLength(0);
    expect(personsFull('Engineer el-Hollvardsen Service confirmed the ticket.')).toHaveLength(0);
  });

  it('does not start a name on a particle-hyphen surname without a title or role cue', () => {
    // No cue → branch never fires → the lowercase-initial token fails the
    // capitalization bailout. Same shape that today's gap report flagged single-
    // token, but here even with a continuation it stays out without a cue.
    expect(personsFull('Yesterday al-Brakkenzoon Vandermeerux walked in.')).toHaveLength(0);
  });

  it('does not fire on a particle-hyphen token whose tail is lowercase', () => {
    // particleHyphenName requires the tail to be capitalized, so the food /
    // place ("al-forno", "al-quds" lowercased) stays out even after a cue.
    expect(personsFull('Customer al-forno ordered tonight.')).toHaveLength(0);
  });
});

describe('apostrophe-prefixed surnames (Irish "O\'", Italian/French "D\'")', () => {
  // The DB indexes the family root ("sullivan", "neill", "hara", "angelo",
  // "amico") but the ingest sources don't carry the glued apostrophe surface
  // form ("o'sullivan"), so a plain dictionary lookup on the whole token
  // misses it. Verified against the FULL committed dictionary: the exact
  // compound below is confirmed absent while its root is confirmed present,
  // so detection rides on the apostrophe-root fallback, not memorization of
  // a compound the DB happens to carry.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('proves the compound surface form is absent while the root is present', () => {
    const pairs: Array<[string, string]> = [
      ["o'sullivan", 'sullivan'],
      ["o'neill", 'neill'],
      ["o'hara", 'hara'],
      ["d'angelo", 'angelo'],
      ["d'amico", 'amico'],
    ];
    for (const [compound, root] of pairs) {
      expect(
        fullSource.hasFamily(compound, 'Latin') || fullSource.hasGiven(compound, 'Latin'),
        `${compound} should be absent as a compound`
      ).toBe(false);
      expect(
        fullSource.hasFamily(root, 'Latin') || fullSource.hasGiven(root, 'Latin'),
        `${root} should be present as the DB root`
      ).toBe(true);
    }
  });

  it('chains a DB-known given name into an apostrophe-prefixed surname', () => {
    expect(personsFull("Sean O'Neill called about his account.")).toContain("Sean O'Neill");
    expect(personsFull("Marco D'Angelo confirmed the order.")).toContain("Marco D'Angelo");
  });

  it('anchors backward from an unknown given name onto the surname root', () => {
    // "Niamh" is out of the DB, so only the apostrophe-root fallback on
    // "O'Sullivan" (family root "sullivan") lets the backward-unknown-cap
    // anchor see a corroborating name part.
    expect(personsFull("Follow-up by Niamh O'Sullivan: refund issued to the customer.")).toContain(
      "Niamh O'Sullivan"
    );
  });

  it('detects a single apostrophe-prefixed surname after a title', () => {
    expect(personsFull("Dr. O'Hara confirmed the diagnosis.")).toContain("O'Hara");
  });

  it('does not treat contractions or mid-word apostrophes as name parts', () => {
    expect(personsFull("I don't know if it's true.")).toHaveLength(0);
    expect(personsFull("We visited Ta'if last year.")).toHaveLength(0);
    expect(personsFull("Rock'n'Roll is a genre.")).toHaveLength(0);
  });

  it('does not start a name on a lone apostrophe-prefixed surname without a cue', () => {
    expect(personsFull("O'Hara reviewed the file.")).toHaveLength(0);
  });
});

describe('Persian/Urdu "ul-" particle in compound surnames', () => {
  // "Naveed ul-Haq", "Mahbub ul-Haq", "Zia ul-Haq", "Inayat ul-Allah": the
  // Arabic article transliterated with sun-letter assimilation. The tokenizer
  // glues "ul-Haq" into one lowercase-initial token, so without "ul" in
  // PARTICLES the chain truncates at the given name — even when the fused
  // surname is in the DB. Verified against the FULL committed dictionary so
  // the names below are genuinely held out: detection rides on the particle
  // membership of "ul", never on dictionary memorization of these specific
  // given names or surnames.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('chains a held-out "ul-Surname" after a role cue', () => {
    expect(personsFull('Eng. Tahmidur ul-Dawla submitted the refund.')).toContain(
      'Tahmidur ul-Dawla'
    );
    expect(personsFull('Account holder Rumman ul-Muizz called yesterday.')).toContain(
      'Rumman ul-Muizz'
    );
  });

  it('chains a held-out "ul-Surname" after a title abbreviation', () => {
    expect(personsFull('Filed by Dr. Sadaqat ul-Dawla overnight.')).toContain('Sadaqat ul-Dawla');
  });

  it('proves the "ul-" names are held out (absent from the full DB)', () => {
    // The fix is the new particle entry, not memorization: if any of these land
    // in the DB later the test trips and a fresh held-out pair must be picked.
    const heldOut = ['tahmidur', 'rumman', 'sadaqat', 'dawla', 'muizz'];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('does not start a name on a bare "ul-Surname" without a cue', () => {
    // Same shape as the existing al-/el-/abu- particle-hyphen-start guard: no
    // cue → branch never fires → the lowercase-initial token stays out.
    expect(personsFull('Yesterday ul-Dawla walked into the office.')).toHaveLength(0);
  });

  it('does not fire on "ul-" with a lowercase tail', () => {
    // particleHyphenName requires the tail to be capitalized, so loanwords with
    // a lowercase tail ("ul-trasonic", "ul-timate") stay out even after a cue.
    expect(personsFull('Customer ul-trasonic ordered tonight.')).toHaveLength(0);
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

describe('title-only single-token guard (precision)', () => {
  // A title token alone is the honorific, not a person. The FP that drove this:
  // the email "Dr.henrik.brenner@..." promotes "dr" to a derived core entry, and
  // the preceding role noun "Customer" supplies a role boost, so the lone "Dr"
  // scores 0.65 — past the 0.5 default. The guard rejects any single-token
  // PERSON span whose only token is a known title, so the precision fix
  // generalizes across every title and every promotion path (email-derived core,
  // ext-DB collision, role boost, sentence-initial luck).
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('does not emit "Dr" alone when the in-text email promotes "dr" to core', () => {
    // Reproduces the exact gap-report shape: title before a name, with an email
    // whose local part starts with the same title — without the guard the
    // augmented-source second pass emits "Dr" at confidence 0.65.
    const found = personsFull(
      'Customer Dr. Henrik von Brenner (Dr.henrik.brenner@company.de) called yesterday.'
    );
    expect(found).not.toContain('Dr');
    expect(found).toContain('Henrik von Brenner');
  });

  it('generalizes to other titles + held-out names (not "Dr"-specific)', () => {
    // Same shape with "Prof." and held-out tokens. Proves the guard fires for
    // any title and that the multi-part real name is still detected via the
    // heuristic (the surname is absent from the DB — see held-out check below).
    const found = personsFull(
      'Customer Prof. Qwesterveldt Brakkenzoon (Prof.qwesterveldt.brakkenzoon@example.com) replied.'
    );
    expect(found).not.toContain('Prof');
    expect(found).toContain('Qwesterveldt Brakkenzoon');
  });

  it('does not emit a lone title when the chain cannot extend across a period', () => {
    // No name follows the title on the same chain — without the guard the role
    // cue + DB collision is enough to surface a single-token "Mr"/"Mrs"/"Hajj".
    expect(personsFull('Customer Mr. (mr.foo.bar@example.com) replied.')).not.toContain('Mr');
    expect(personsFull('Reach Mrs. for assistance.')).toHaveLength(0);
    expect(personsFull('Holder Hajj. visited the branch.')).not.toContain('Hajj');
  });

  it('still detects a multi-part chain whose first part happens to be a title', () => {
    // "Don" is a Spanish honorific AND a common given name; with a real surname
    // following, parts >= 2 proves it is a real name and the chain still fires.
    // Surname is held-out so this rides on the heuristic, not memorization.
    expect(personsFull('Don Brakkenzoon signed the form.')).toContain('Don Brakkenzoon');
  });

  it('proves the held-out values are absent from the full DB', () => {
    // Uses the FULL committed dictionary (curated `core` + ingested `ext`) so a
    // future bulk-ingest that adds any of these tokens trips the check and
    // forces a fresh held-out pair — otherwise the detection cases above stop
    // proving the heuristic and start riding the dictionary.
    for (const word of ['qwesterveldt', 'brakkenzoon']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });
});

describe('role-abbreviation single-token guard (precision)', () => {
  // Parallel to the title-only guard above: a known role abbreviation token
  // ("Eng.") alone is the role cue, not a person. The FP that drove this:
  // "Escalated by Sr. Eng. Maria López-García" — "Sr." (title) precedes "Eng",
  // pushing "Eng" through the unknown-capitalization path; the title boost
  // alone (0.3 + 0.35 = 0.65) clears the 0.5 threshold while the dot after
  // "Eng" breaks chain extension into the real surname. The guard rejects any
  // single-token PERSON span whose only token is a known role abbreviation,
  // mirroring the existing title-isolation rule.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('does not emit "Eng" alone when a title-then-role-abbr precedes the real name', () => {
    // Reproduces the exact gap-report shape. The real name uses a held-out
    // surname so the chain rides the heuristic (titleBefore + multi-part DB
    // hit), not memorization of any specific person.
    const found = personsFull('Escalated by Sr. Eng. Maria Qwesterveldt to triage.');
    expect(found).not.toContain('Eng');
    expect(found).toContain('Maria Qwesterveldt');
  });

  it('generalizes to other titles + held-out names paired with "Eng."', () => {
    // Same shape with a different title and entirely held-out name parts —
    // proves the guard fires for any title-preceding-role-abbr combination,
    // not just "Sr."-specific or "Maria"-specific input.
    const found = personsFull('Resolved by Dr. Eng. Qwesterveldt Brakkenzoon yesterday.');
    expect(found).not.toContain('Eng');
    expect(found).toContain('Qwesterveldt Brakkenzoon');
  });

  it('still detects multi-part chains following a bare role abbreviation (no title)', () => {
    // No title before "Eng.": the role-abbreviation path on the NEXT token
    // (the real name) still fires and produces a normal multi-part detection.
    // Surname is held-out so the chain rides the heuristic.
    expect(personsFull('Eng. Qwesterveldt Brakkenzoon signed off.')).toContain(
      'Qwesterveldt Brakkenzoon'
    );
  });

  it('proves the held-out values are absent from the full DB', () => {
    // Same held-out pair as the title-isolation block. A future bulk-ingest
    // that adds either trips this check and forces a fresh pair, keeping the
    // detection cases above honest about which lever they exercise.
    for (const word of ['qwesterveldt', 'brakkenzoon']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
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

describe('fold-tier symmetry (accented ext + folded core → treated as core)', () => {
  // Ingest coverage for common Latin diacritic names is currently split across
  // tiers: 'garcía' / 'lópez' / 'josé' / 'maría' / 'rodríguez' / 'martín' land
  // in the ingested `ext` pack, while their ASCII-folded forms 'garcia' /
  // 'lopez' / 'jose' / ... are in the curated `core` pack. Membership lookups
  // already fold accented → ASCII (see `lookup()` in names.ts), but tier
  // reporting used to return the raw-lookup tier and stop, so an accented
  // single-token surname scored as ext-only and hit the parts===1 && extOnly
  // && !titleBefore penalty (0.4, below the 0.5 threshold). The fix aligns
  // tier reporting with the fold semantic — the stronger of the accented and
  // folded tiers is returned — and rescues an entire class of names, not just
  // the specific case that surfaced the gap.
  //
  // Verified against the FULL committed dictionary so the tier bifurcation is
  // real, not a fixture artifact. All held-out cases use accented names that
  // are absent from the specific gap ("García-López") — the fix generalizes
  // beyond the trigger.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('proves the tier bifurcation exists in the full committed DB', () => {
    // If ingest is ever reorganized so the accented form itself lands in core,
    // these assertions catch it and remind us to re-point the held-out surfaces.
    // matchTier is on the underlying PackNameSource; access via any-cast since
    // the NameSource interface hides it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchTier = (fullSource as any).matchTier.bind(fullSource);
    for (const pair of [
      ['rodríguez', 'rodriguez'],
      ['josé', 'jose'],
      ['maría', 'maria'],
      ['sofía', 'sofia'],
      ['martín', 'martin'],
    ] as const) {
      const [accented, folded] = pair;
      expect(matchTier(accented, 'Latin'), `${accented} accented tier`).toBe('ext');
      expect(matchTier(folded, 'Latin'), `${folded} folded tier`).toBe('core');
    }
  });

  it('detects a single accented surname after a role-label colon', () => {
    // Rodríguez — accented=ext, folded=core in the full DB. Without the tier
    // fix this scores 0.4 and misses; with the fix the core tier applies and
    // it scores 0.65.
    expect(personsFull('Support ref contact: Rodríguez.')).toContain('Rodríguez');
  });

  it('detects an accented sentence-initial single-token given name', () => {
    // José — accented=ext, folded=core. The sentence-start ext guard used to
    // drop this because tierOf reported ext despite the folded form being
    // core. After the fix the guard sees core and lets the chain start.
    expect(personsFull('José confirmed the shipment yesterday.')).toContain('José');
    expect(personsFull('María approved the refund this morning.')).toContain('María');
  });

  it('detects an accented hyphenated single-token surname after a role cue', () => {
    // The exact gap-generating shape — a hyphenated ext/core-split surname
    // introduced by a role-label colon. Held out against the specific gap
    // trigger ("García-López") by using a different pairing.
    expect(personsFull('Spanish ref contact: Rodríguez-López.')).toContain('Rodríguez-López');
  });

  it('leaves ASCII single-token detection unchanged (no diacritic → no fold path)', () => {
    // Volkov has no diacritics; the fix short-circuits via folded===p and
    // returns the raw tier. This keeps the backward-anchor rescue working —
    // an unknown given ("Vitya") before an ASCII ext surname still detects
    // together, exactly like today.
    expect(personsFull('Vitya Volkov requested a refund.')).toContain('Vitya Volkov');
    expect(personsFull('Wojciech Lindqvist arrived this morning.')).toContain('Wojciech Lindqvist');
  });

  it('does not turn accented non-name vocabulary into people (fold-only path)', () => {
    // These words have matchTier(accented) === null; the folded form may hit
    // ext ("nao", "esta") but the sentence-start ext guard still fires
    // because tierLookup returns ext (the stronger of null and ext), never
    // core. Ensures the fix only promotes tokens whose folded form is truly
    // core — not any word that happens to fold to something in ext.
    expect(personsFull('Não podemos aceitar isso hoje.')).toHaveLength(0);
    expect(personsFull('Está pronto para revisar imediatamente.')).toHaveLength(0);
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

describe('sentence-initial ext name + particle-hyphen surname', () => {
  // Asymmetry fix: the corroboration check accepted any bare capitalized follower
  // ("Bahar Qorvanni"), but rejected the morphologically equivalent particle-hyphen
  // surname the tokenizer keeps as one lowercase-initial unit ("Muhammad al-Rashid").
  // Verified against the FULL committed dictionary so the surnames are genuinely
  // held out — detection rides on the structural heuristic, not on memorization.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('anchors an ext given + held-out al-/el- surname at sentence start', () => {
    expect(personsFull('Khaled al-Qorvanni reached out today.')).toContain('Khaled al-Qorvanni');
    expect(personsFull('Tariq el-Brundlefitz approved the refund.')).toContain(
      'Tariq el-Brundlefitz'
    );
  });

  it('proves the surnames are held out (absent from the full DB)', () => {
    // If any of these land in the DB later, re-point at fresh held-outs.
    for (const word of ['qorvanni', 'brundlefitz']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('still suppresses a particle-hyphen follower whose tail is lowercase', () => {
    // particleHyphenName requires the tail to be capitalized, so structural
    // identifiers / Italian dishes / loanword phrases keep the guard's protection.
    expect(personsFull('Pizza al-forno was delivered tonight.')).toHaveLength(0);
    expect(personsFull('Story al-quds was published yesterday.')).toHaveLength(0);
  });

  it('does not start a chain on a bare lowercase particle-hyphen token', () => {
    // No leading anchor token, so the relaxed corroboration cannot fire on its own.
    expect(personsFull('al-Rashid configuration is documented elsewhere.')).toHaveLength(0);
  });
});

describe('middle-initial bridge ("Given X. Surname")', () => {
  // Chain extension only bridges pure whitespace, so the period after a
  // one-letter initial truncates "Rajesh R. Iyer" into "Rajesh R" and leaves
  // the surname to start a separate (frequently FP) chain. The fix lets the
  // initial's trailing dot stand in for the gap — but only when the previous
  // token is exactly one capitalized letter directly followed by '.', so a
  // multi-letter sentence-final word never bridges into the next clause.
  //
  // Verified against the FULL committed dictionary so the held-out cases ride
  // on the bridge heuristic (anchored by title/role + chain extension on
  // unknown-cap tokens) and not on the dictionary.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('joins given + initial + surname into one span (title-anchored, held out)', () => {
    expect(personsFull('Please contact Dr. Qwesterveldt R. Brakkenzoon for details.')).toContain(
      'Qwesterveldt R. Brakkenzoon'
    );
  });

  it('joins given + initial + surname after a role cue (held out)', () => {
    expect(personsFull('Engineer Wlodimar A. Krimbleton signed the doc.')).toContain(
      'Wlodimar A. Krimbleton'
    );
    expect(personsFull('Account holder Vexbruck T. Hollvardsen disputed the charge.')).toContain(
      'Vexbruck T. Hollvardsen'
    );
  });

  it('chains across two consecutive initials ("J. K. Surname", held out)', () => {
    // Two initials in a row — each is a one-letter token whose trailing dot
    // bridges the next gap. Anchored by the title so the chain can start on
    // the unknown given name.
    expect(personsFull('Memo by Dr. Aurelienne J. K. Zwingenberger arrived.')).toContain(
      'Aurelienne J. K. Zwingenberger'
    );
  });

  it('proves the held-out names are absent from the full DB', () => {
    // If a future bulk ingest lands any of these tokens, swap them for fresh
    // ones — otherwise the test stops proving the heuristic.
    for (const word of [
      'qwesterveldt',
      'brakkenzoon',
      'wlodimar',
      'krimbleton',
      'vexbruck',
      'hollvardsen',
      'aurelienne',
      'zwingenberger',
    ]) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('does not bridge a multi-letter sentence-final word (precision guard)', () => {
    // The bridge is gated on length === 1, so a real sentence end with a
    // multi-letter prior token never lets the next clause join the chain.
    expect(persons('The engineer arrived. Smith left the building.')).toEqual(['Smith']);
  });

  it('truncates the chain at the initial when the next token is not a name', () => {
    // The bridge merely relaxes the gap — the nameLike check still applies, so
    // a lowercase follower (verb, article, …) ends the chain at the initial.
    expect(persons('John Q. arrived at 5pm.')).toContain('John Q');
  });

  it('does not bridge after a period when the prior token is not a single letter', () => {
    // Title abbreviations like "Dr. Smith. John …" must not let "John" join the
    // first chain via the period — only one-letter initials bridge.
    const got = persons('Help Mr. Smith. John was busy with reports.');
    expect(got).toContain('Smith');
    expect(got).not.toContain('Smith. John');
  });
});

describe('ALL-CAPS short acronyms are never name parts', () => {
  // FP shape from the coverage probe: a 2-4 letter ALL-CAPS Latin run after (or
  // inside) a name chain ("Tech ID", "Sarah Smith DOB", "Dr. ID confirmed")
  // was being absorbed as a name part — the lowercased form coincidentally
  // appears in the long-tail surname list, or the title/role boost alone pushed
  // it over threshold. The structural acronym classifier (length-2-4 ASCII
  // uppercase) rejects them everywhere a chain might pick them up. Verified
  // against the FULL committed dictionary so the held-out acronyms below ride
  // on the surface heuristic, not on dictionary absence.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('does not anchor a sentence-start ext name + ALL-CAPS acronym ("Tech ID")', () => {
    // Reproduces the exact gap-report FP. "Tech" is an ext-tier surname surface
    // (US-Census long-tail); a held-out ALL-CAPS acronym ("QXR") must not
    // corroborate it at sentence start.
    expect(
      personsFull(
        'Status note: caller raised the ticket. Tech QXR: BUILD-7.5.0-alpha was attached.'
      )
    ).toHaveLength(0);
  });

  it('does not let a title alone anchor an ALL-CAPS short acronym ("Dr. ID")', () => {
    // The title boost alone (0.65) used to clear the threshold on an unknown
    // capitalized 2-4 char ALL-CAPS token. Held-out: "ZPL" / "XQT" are not in
    // the full DB and are not real names — the title boost must not promote them.
    expect(personsFull('Dr. ZPL confirmed the booking.')).toHaveLength(0);
    expect(personsFull('Engineer XQT handled the case.')).toHaveLength(0);
  });

  it('truncates a chain that runs into an ALL-CAPS acronym ("Sarah Smith DEX")', () => {
    // Chain-extension absorption: a real name followed by an ALL-CAPS label
    // ("DEX", "QZX") used to extend the chain ("Sarah Smith DEX"@1.0). The
    // surname only counts now, so the label stays out of the span.
    const found = personsFull('Sarah Smith DEX: 1990 was confirmed.');
    expect(found).not.toContain('Sarah Smith DEX');
    expect(found).toContain('Sarah Smith');
    const found2 = personsFull('Customer Anna Schmidt QZX updated her profile.');
    expect(found2).not.toContain('Anna Schmidt QZX');
    expect(found2).toContain('Anna Schmidt');
  });

  it('does not anchor a core name + ALL-CAPS acronym chain ("Anderson YXC")', () => {
    // Mid-sentence chain extension into a held-out ALL-CAPS label. The
    // single-name fallback (Anderson alone, parts=1 core hit) may still detect,
    // but the chained "Anderson YXC" FP must not.
    expect(personsFull('After triage. Anderson YXC: BUILD-7 was logged.')).not.toContain(
      'Anderson YXC'
    );
  });

  it('proves the ALL-CAPS labels are held out (absent from the full DB)', () => {
    // The lever is the surface shape, not absence — but absence keeps these tests
    // honest. If a label below lands in the DB later, re-point at fresh held-outs;
    // the structural fix still applies because it ignores DB membership.
    for (const word of ['qxr', 'zpl', 'xqt', 'dex', 'qzx', 'yxc']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('precision: mixed-case names still anchor and extend normally', () => {
    // Negative guard: the rule is length-2-4 ASCII all-uppercase. Any mixed-case
    // token escapes it, so ordinary names ride through unchanged.
    expect(personsFull('Sarah Smith updated her profile today.')).toContain('Sarah Smith');
    expect(personsFull('Customer Anna Schmidt requested support.')).toContain('Anna Schmidt');
    // A short DB-hit given name in mixed case still anchors at sentence start.
    expect(personsFull('Bob Anderson signed off on the ticket.')).toContain('Bob Anderson');
  });

  it('precision: 5+ letter ALL-CAPS surnames still anchor (length window)', () => {
    // The window stops at 4 chars on purpose — formal/legal documents that
    // capitalize a full surname ("GARCIA", "SMITH", "JOHNSON") must still detect.
    expect(personsFull('Account holder GARCIA filed the appeal.')).toContain('GARCIA');
  });

  it('precision: digits and punctuation in the token disqualify the acronym rule', () => {
    // The regex is /^[A-Z]{2,4}$/ — strictly letters, length 2-4. A token like
    // "A1" or "B2C" is not all-letters and is left to other gates. Held-out
    // surname so the case rides on the heuristic.
    expect(personsFull('Customer Marcus Qwerznok contacted support.')).toContain('Marcus Qwerznok');
  });

  it('mechanism: structural fix ignores DB membership (PIN-shape)', () => {
    // "pin" / "ui" / "os" are real ext-tier surname surfaces from the long-tail
    // Census list, so a chain extension used to absorb the ALL-CAPS surface
    // ("Sarah Smith PIN"). The rule is purely structural and rejects them
    // regardless of DB hit — fixture lets us prove this independent of which
    // names happen to be in production.
    const fixture = new PackNameSource();
    fixture.addWords(['sarah'], { script: 'Latin', tier: 'core' }, 'latin-core');
    fixture.addWords(['smith', 'pin'], { script: 'Latin', tier: 'ext' }, 'latin-ext');
    expect(fixture.hasFamily('pin', 'Latin')).toBe(true); // sanity: PIN-lowercased IS in DB
    const found = detect('Customer Sarah Smith PIN updated her profile.', {
      nameSource: fixture,
    })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);
    expect(found).not.toContain('Sarah Smith PIN');
    expect(found).toContain('Sarah Smith');
  });
});

describe('title/role cue + particle-hyphen-name chain start', () => {
  // Parity fix for the gap-report case "customer al-Rashid al-Makki": both name
  // parts are particle-hyphen tokens the tokenizer keeps lowercase-initial, and
  // even the surface forms with strong context cannot START a chain. The path
  // already existed for plain capitalized tokens and for bare lowercase particles
  // ("Dr. de la Cruz") followed by a Capitalized surname — this brings the
  // particle-hyphen shape to parity. All surnames below are verified absent from
  // the FULL committed dictionary so the test rides on the heuristic alone.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects two held-out particle-hyphen surnames anchored by a role cue', () => {
    expect(personsFull('Customer al-Qorvanni al-Brundlefitz approved the refund.')).toContain(
      'al-Qorvanni al-Brundlefitz'
    );
    expect(personsFull('Engineer al-Qorvanni al-Brundlefitz handled the case.')).toContain(
      'al-Qorvanni al-Brundlefitz'
    );
    expect(personsFull('Client ben-Qorvanni ben-Brundlefitz called support.')).toContain(
      'ben-Qorvanni ben-Brundlefitz'
    );
  });

  it('detects a particle-hyphen + plain Capitalized surname after a title', () => {
    // "Dr." title cue + held-out particle-hyphen + held-out bare-Capitalized surname.
    expect(personsFull('Dr. el-Qorvanni Brundlefitz reported the issue.')).toContain(
      'el-Qorvanni Brundlefitz'
    );
    // "Eng." abbreviated role cue with the same shape.
    expect(personsFull('Eng. al-Qorvanni al-Brundlefitz joined the call.')).toContain(
      'al-Qorvanni al-Brundlefitz'
    );
  });

  it('proves the chosen surnames are held out (absent from the full DB)', () => {
    // Re-point at fresh held-outs if any of these later land in the DB.
    for (const word of ['qorvanni', 'brundlefitz']) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });

  it('does not fire without a leading title/role cue', () => {
    // No cue, no DB hit on either part → relaxed start must not anchor.
    expect(personsFull('al-Qorvanni al-Brundlefitz joined the call.')).toHaveLength(0);
  });

  it('does not fire when the second part is a structural noun', () => {
    // nameContinuation rejects NON_NAME_WORDS as the corroborating follower, so a
    // role cue + particle-hyphen + structural noun cannot promote.
    expect(personsFull('Customer al-Qorvanni Department joined today.')).toHaveLength(0);
    expect(personsFull('Engineer al-Qorvanni Service approved the refund.')).toHaveLength(0);
  });

  it('does not fire on a lone particle-hyphen token after the cue', () => {
    // Single-token candidate after the cue → nameContinuation returns false → no start.
    expect(personsFull('Customer al-Qorvanni said the case was forwarded.')).toHaveLength(0);
  });

  it('does not fire when the tail of the particle-hyphen is lowercase', () => {
    // particleHyphenName requires the post-hyphen tail to be capitalized, so
    // Italian dishes / loanword phrases keep their existing protection.
    expect(personsFull('Customer al-forno ordered a pizza.')).toHaveLength(0);
  });
});

describe('AKA-in-parens frame ("<Name> (<Alias>)")', () => {
  // Support / CRM prose puts nicknames, given names, or alias disambiguators
  // in parentheses directly after the full name: "Customer von Neumann
  // (Johann) called", "Dr. Patel (Aisha) reviewed". The inner token sits at a
  // `(`-sentence-start with no title or role cue to vouch for it, so the
  // chain detector's sentence-start guard silently drops it even when it is
  // in the dictionary. The fence is structural — a *confirmed* name span sits
  // directly before the open paren, the alias is a single token, the close
  // paren follows it directly — so the cue licenses the alias on shape alone,
  // without needing it in the database. All names below are held out against
  // the full committed dictionary so the heuristic is what's being tested.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects an alias whose token is absent from the full DB', () => {
    // "Qwerlin" is held out; the cue is the parens fence after a confirmed
    // name. Without the heuristic the alias is dropped at `(`-sentence-start.
    expect(personsFull('Customer Klaus-Dieter Müller (Qwerlin) confirmed today.')).toContain(
      'Qwerlin'
    );
    expect(personsFull('Dr. Fatima Al-Rashid (Vexbruck) reviewed the case.')).toContain('Vexbruck');
  });

  it('detects an alias right after a sentence-initial confirmed name span', () => {
    expect(personsFull('Maria López (Qwesterveldt) signed off.')).toContain('Qwesterveldt');
  });

  it('tolerates no whitespace between the name and the open paren', () => {
    // The gap regex accepts `(` with optional horizontal whitespace either
    // side, so "Smith(Bob)" — tight, common in compact log lines — still fires.
    expect(personsFull('Maria López(Qwerlin) signed off.')).toContain('Qwerlin');
  });

  it('does not fire on an all-caps acronym in parens', () => {
    // CEO / HR / IT / NYC / FBI — uppercase short tokens. The shape filter
    // (at least one lowercase letter) is the gate.
    expect(personsFull('Maria López (CEO) approved.')).not.toContain('CEO');
    expect(personsFull('Maria López (HR) approved.')).not.toContain('HR');
    expect(personsFull('Maria López (NYC) approved.')).not.toContain('NYC');
  });

  it('does not fire on a known role / title / non-name word', () => {
    // The NON_NAME_WORDS / role / title guards block common parens content
    // that is not a person — even when the lemma is in the ext dictionary
    // ("Manager", "Director", "Lead" are real census surnames).
    expect(personsFull('Maria López (Manager) approved.')).not.toContain('Manager');
    expect(personsFull('Maria López (Director) approved.')).not.toContain('Director');
    expect(personsFull('Maria López (Status) approved.')).not.toContain('Status');
    expect(personsFull('Maria López (Service) approved.')).not.toContain('Service');
    expect(personsFull('Maria López (Active) approved.')).not.toContain('Active');
    expect(personsFull('Maria López (Pending) approved.')).not.toContain('Pending');
    expect(personsFull('Maria López (Dr) approved.')).not.toContain('Dr');
    expect(personsFull('Maria López (Customer) approved.')).not.toContain('Customer');
  });

  it('does not fire on an ambiguous common word in parens (city, month)', () => {
    // AMBIGUOUS_WORDS blocks tokens that are also ordinary vocabulary so a
    // city / month annotation after a name does not promote — the most common
    // alternative meaning of `<Name> (Cap)` in ticket prose.
    expect(personsFull('Maria López (Berlin) approved.')).not.toContain('Berlin');
    expect(personsFull('Maria López (April) approved.')).not.toContain('April');
  });

  it('does not fire on a parenthesized non-alias (token followed by more content)', () => {
    // The close-paren must follow the alias directly. A second token inside
    // the parens ("(Smith Department)", "(Berlin office)") leaves the chain
    // to the regular detector path, not this cue.
    expect(personsFull('Maria López (Qwerlin office) approved.')).not.toContain('Qwerlin');
  });

  it('does not fire without a confirmed name span before the open paren', () => {
    // A bare "(Qwerlin)" or a `(` after non-name content cannot license the
    // alias — the structural fence requires the just-emitted PERSON.
    expect(personsFull('The (Qwerlin) flag was raised.')).toHaveLength(0);
    expect(personsFull('Status: (Qwerlin) review pending.')).toHaveLength(0);
  });

  it('does not fire when the open paren sits across a line break', () => {
    // ALIAS_OPEN_GAP stays horizontal-whitespace-only, so a `\n` between the
    // name span and the parenthesized token never bridges the cue.
    expect(personsFull('Customer Klaus-Dieter Müller\n(Qwerlin) confirmed today.')).not.toContain(
      'Qwerlin'
    );
  });

  it('proves the AKA-in-parens names are held out (absent from the full DB)', () => {
    // The detection rides on the structural cue, not on dictionary membership.
    // If any of these surface in the DB later, the cases above stop proving
    // generalization and the held-out values must be re-pointed.
    const heldOut = ['qwerlin', 'vexbruck', 'qwesterveldt'];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
  });
});

describe('title-tail cue guard (dual-use honorific/surname at end of chain)', () => {
  // Many honorifics in titles.ts coincide with common surnames in Arabic,
  // Persian, South-Asian and Spanish naming — "hajj", "haji", "don", "sayed",
  // "sayyid", "rev", "sir", "lord", "lady", "imam", "ustad", "shri", "smt", …
  // Before this guard, TITLE_GAP's optional dot accepted the sentence-ending
  // period after such a token when it closed a name chain, so the next
  // capitalized word inherited a spurious titleBefore boost and got emitted at
  // ~0.65 confidence: "Customer Leila Hajj. Email:…" → FP "Email",
  // "Customer Ayla Hajj. Reference:…" → FP "Reference". The class is broad and
  // real support prose exercises it (any ticket log that names a customer with
  // an Arabic-family surname and then starts the next sentence with a Cap
  // label). The guard suppresses the title / role / handoff / source-frame
  // lookback when the immediately-preceding token was just consumed as the
  // tail of a preceding emitted name span — a token can be either name-tail
  // or cue, never both for adjacent candidates.
  //
  // Held-out proof: the *follower* words that would have leaked as FPs are
  // absent from the full committed DB (see the held-out assertion at the end),
  // and one of the anchor chains uses a DB-absent given name too, so the
  // detections and non-detections here are both heuristic-driven.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('does not fire a spurious PERSON on the next Cap word after "<Name Title>."', () => {
    expect(personsFull('Customer Sven Hajj. Kwargs unreachable in staging.')).toEqual([
      'Sven Hajj',
    ]);
    expect(personsFull('Customer Ines Don. Turnabout requested by legal.')).toEqual(['Ines Don']);
    expect(personsFull('Escalated to Aylin Sayed. Zellwerk failed integration test.')).toEqual([
      'Aylin Sayed',
    ]);
    expect(
      personsFull('Support note from Priya Rev. Splindley pipeline aborted overnight.')
    ).toEqual(['Priya Rev']);
  });

  it('does not fire on the exact minimized FP shape from the coverage report', () => {
    // Verbatim from the discovery feed — the coverage evaluator surfaced
    // "Email" as a PERSON here. After the guard the chain "Leila Hajj"
    // detects and no follower does.
    expect(
      personsFull(
        'Final response: Eng. Andreas Christopoulos and customer Leila Hajj. Email: leila.hajj@beirut.lb, card 3530 1113 3330 0000, IPv6 fe80::1. Status: CLOSED.'
      )
    ).toEqual(['Andreas Christopoulos', 'Leila Hajj']);
  });

  it('still detects a real title cue in isolation ("Dr. Anjali Qwertz")', () => {
    // Single-token title anchor path is unaffected: prev="Dr." was NEVER
    // emitted as part of a name span (the outer loop's parts===1+isTitle guard
    // skips it before it can become an emitted tail), so titleBefore still
    // fires for the following candidate.
    expect(personsFull('Please ask Dr. Anjali Qwertz about it.')).toContain('Anjali Qwertz');
  });

  it('still detects a title-first chain that CONTAINS the dual-use token as prefix', () => {
    // "Sheikh Yusuf ..." — the honorific opens the chain and is absorbed as
    // part of a multi-token name. This path never depends on a preceding
    // emitted span, so the guard doesn't touch it.
    expect(personsFull('Sheikh Yusuf al-Qaradawi visited the branch today.')).toContain(
      'Sheikh Yusuf al-Qaradawi'
    );
  });

  it('proves the title-tail follower words are absent from the full DB', () => {
    // The precision fix rides on the structural cue-suppression rule, not on
    // dictionary knowledge of the follower. If any of these ever land in the
    // DB later, the negative assertions above stop being a heuristic proof
    // and the values must be re-pointed to fresh out-of-DB tokens.
    const heldOut = ['kwargs', 'turnabout', 'zellwerk', 'splindley', 'sven'];
    for (const word of heldOut) {
      expect(fullSource.hasGiven(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, 'Latin'), `${word} should be out-of-DB`).toBe(false);
    }
    // And the title-tail tokens that trigger the guard MUST be in TITLES —
    // if any of them are removed from titles.ts, the FP class stops existing
    // and these regression cases lose their point.
    for (const t of ['hajj', 'don', 'sayed', 'rev']) {
      expect(fullSource.hasGiven(t, 'Latin'), `${t} should be a DB name`).toBe(true);
    }
  });
});

describe('Cyrillic names (Russian / Ukrainian / Balkan / Bulgarian)', () => {
  // Cyrillic is bicameral, so — unlike the caseless native scripts — it detects
  // through the same capitalization-gated path as Latin (see isBicameralNameScript
  // in names.ts): a Cap-initial DB hit promotes, a bare lowercase collision does
  // not. Held out against the FULL committed DB: these are ordinary Cyrillic
  // names from Wikidata's country-constrained harvest, none of them the specific
  // fixture the pipeline was tuned on, so a pass proves the pack + engine path
  // generalize rather than memorize.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('detects a Russian given + family pair', () => {
    expect(personsFull('Клиент: Владимир Петров подал жалобу.')).toContain('Владимир Петров');
  });

  it('detects a Ukrainian given + family pair', () => {
    expect(personsFull('Контакт — Олександр Коваленко звернувся.')).toContain(
      'Олександр Коваленко'
    );
  });

  it('detects a name at a sentence start via the corroborating surname', () => {
    // The sentence-initial anchor needs a following DB-confirmed name part;
    // nameContinuation was extended to bicameral scripts so a Cyrillic surname
    // corroborates a Cyrillic given name here just as a Latin one would.
    expect(personsFull('Мария Иванова оформила возврат.')).toContain('Мария Иванова');
  });

  it('does NOT detect ordinary lowercase Cyrillic words as names', () => {
    // The whole point of routing Cyrillic through the bicameral (capitalized)
    // path rather than the caseless one: a run of common lowercase words must
    // never promote, even if a token collides with a surname in the pack.
    expect(personsFull('сегодня была хорошая погода в городе')).toEqual([]);
  });
});

describe('street addresses are not people', () => {
  // A capitalized word followed by a thoroughfare suffix is a street name, not a
  // person, even though both tokens look like name parts ("Baker"/"Street" are
  // both ext-tier surnames; "Sunny" is a given name). See streets.ts for the
  // unambiguous-vs-ambiguous split. Held out against the full committed DB
  // (core + ext) so the assertions exercise the real shipped data, and phrased
  // with different streets than the ones the guard lists so they prove the
  // heuristic generalizes rather than memorizing a fixture.
  const fullSource = nameSourceFromBuildInputs();
  const personsFull = (text: string) =>
    detect(text, { nameSource: fullSource })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('does not read an unambiguous street type as a surname', () => {
    // "Street" / "Boulevard" / "Avenue" essentially never occur as real Latin
    // surnames, so they break the chain regardless of surrounding context.
    expect(personsFull('The office is on Cherry Street near the park.')).toEqual([]);
    expect(personsFull('We walked down Sunset Boulevard at dusk.')).toEqual([]);
    expect(personsFull('Turn left onto Madison Avenue and continue.')).toEqual([]);
  });

  it('does not re-anchor a freed street type onto the following word', () => {
    // After the chain breaks at "Street", the freed ext-tier "Street" token must
    // not start a fresh chain and swallow the trailing place ("Street London").
    expect(personsFull('Ship it to 221B Baker Street London tomorrow.')).toEqual([]);
  });

  it('treats an ambiguous suffix as a street only under a house number', () => {
    // "Lane" / "Court" double as common surnames, so the address reading needs a
    // leading house number: "42 Sunny Lane" is an address, "Nathan Lane" is a
    // person.
    expect(personsFull('Deliveries go to 42 Sunny Lane before noon.')).toEqual([]);
    expect(personsFull('Please call Nathan Lane about the contract.')).toContain('Nathan Lane');
  });

  it('keeps ambiguous suffixes as surnames when no address context is present', () => {
    // Held-out real people whose surnames coincide with street types — none has
    // a house number, so each must still detect.
    expect(personsFull('The witness Faith Hill testified today.')).toContain('Faith Hill');
    expect(personsFull('Escalated to Margaret Court for review.')).toContain('Margaret Court');
    expect(personsFull('Contact Grace Park in accounting.')).toContain('Grace Park');
  });
});
