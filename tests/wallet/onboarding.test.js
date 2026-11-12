import {
  INTRO_PAGES,
  TOTAL_STEPS,
  backupQuiz,
  introductionPublished,
  journey,
  journeyProgress,
  ordinal,
  pathCard,
} from '../../blue_modules/onboarding';

const words = 'legal winner thank year wave sausage worth useful legal winner thank yellow'.split(' ');
const unique = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');
// A repeatable source of picks.
const picker = seed => {
  let state = seed;
  return n => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor(state / 65536) % n; // the high bits; the low ones of this generator barely vary
  };
};

describe('Recovery phrase check', () => {
  it('asks for three different positions in order, each with the right answer among four', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const quiz = backupQuiz(unique, picker(seed));
      expect(quiz).toHaveLength(3);
      expect(new Set(quiz.map(round => round.position)).size).toBe(3);
      expect(quiz.map(round => round.position)).toEqual([...quiz.map(round => round.position)].sort((a, b) => a - b));
      for (const round of quiz) {
        expect(round.answer).toBe(unique[round.position]);
        expect(round.number).toBe(round.position + 1);
        expect(round.options).toHaveLength(4);
        expect(round.options.filter(option => option === round.answer)).toHaveLength(1);
        expect(new Set(round.options).size).toBe(4);
        // Every wrong answer is a real word from the same phrase.
        for (const option of round.options) expect(unique).toContain(option);
      }
    }
  });

  it('does not always put the answer in the same place', () => {
    const places = new Set();
    for (let seed = 1; seed <= 40; seed++)
      for (const round of backupQuiz(unique, picker(seed))) places.add(round.options.indexOf(round.answer));
    expect(places.size).toBe(4);
  });

  it('copes with a phrase that repeats words', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const round of backupQuiz(words, picker(seed))) {
        expect(round.options.filter(option => option === round.answer)).toHaveLength(1);
        expect(new Set(round.options).size).toBe(round.options.length);
      }
    }
  });

  it('refuses to run without a phrase', () => {
    expect(() => backupQuiz([], picker(1))).toThrow('recovery phrase');
    expect(() => backupQuiz(null, picker(1))).toThrow('recovery phrase');
  });

  it('names positions the way people say them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '24th',
    ]);
  });
});

describe('Introduction', () => {
  it('is three short pages, each with one action, inside a seven-step setup', () => {
    expect(INTRO_PAGES.map(page => page.key)).toEqual(['welcome', 'wallet', 'phrase']);
    expect(TOTAL_STEPS).toBe(7);
    for (const page of INTRO_PAGES) {
      expect(page.title.length).toBeLessThanOrEqual(40);
      expect(page.action).toBeTruthy();
      for (const paragraph of page.body) expect(paragraph.length).toBeLessThanOrEqual(190);
    }
    expect(INTRO_PAGES[2].rules).toHaveLength(3);
  });

  it('explains without jargon', () => {
    const text = JSON.stringify(INTRO_PAGES).toLowerCase();
    for (const term of ['seed', 'mnemonic', 'private key', 'blockchain', 'non-custodial', 'utxo', 'hd wallet', 'bip'])
      expect(text).not.toContain(term);
  });
});

describe('The journey after setup', () => {
  const states = steps => Object.fromEntries(steps.map(step => [step.key, step.state]));

  it('is five steps, and none of them asks a newcomer to find Marscoin first', () => {
    const steps = journey({});
    expect(steps.map(step => step.key)).toEqual(['wallet', 'terms', 'apply', 'citizen', 'vote']);
    expect(steps.map(step => step.title)).toEqual([
      'Create your wallet',
      'Meet the community',
      'Introduce yourself',
      'Become a citizen',
      'Vote',
    ]);
    expect(journeyProgress(steps)).toEqual({ done: 1, total: 5 });
    for (const step of steps) {
      expect(step.route).not.toBe('SwapHome');
      expect(`${step.title} ${step.action}`).not.toMatch(/Get (your first )?Marscoin/);
    }
  });

  it('starts a newcomer at meeting the community, then the introduction', () => {
    const steps = journey({});
    expect(states(steps)).toEqual({ wallet: 'done', terms: 'current', apply: 'ahead', citizen: 'ahead', vote: 'ahead' });
    expect(steps.find(step => step.state === 'current')).toMatchObject({ action: 'Open the community', route: 'CitizenScreen' });
    const next = journey({ termsAccepted: true });
    expect(states(next)).toEqual({ wallet: 'done', terms: 'done', apply: 'current', citizen: 'ahead', vote: 'ahead' });
    expect(next.find(step => step.state === 'current')).toMatchObject({ action: 'Start', route: 'JoinGeneralPublicApplicationScreen' });
    expect(journeyProgress(next)).toEqual({ done: 2, total: 5 });
  });

  it('says the introduction is free to start and promises the gift only when available', () => {
    const { detail } = journey({ termsAccepted: true }).find(step => step.key === 'apply');
    expect(detail).toMatch(/free to start/);
    expect(detail).toMatch(/welcome gift when available/);
    expect(detail).not.toMatch(/!/);
  });

  it('does not depend on what the wallet holds', () => {
    for (const input of [{}, { termsAccepted: true }, { termsAccepted: true, status: 'submitted', applicationStage: 'draft' }]) {
      const empty = journey({ ...input, balance: 0 });
      expect(journey({ ...input, balance: 5000000 })).toEqual(empty);
      expect(journey(input)).toEqual(empty);
    }
  });

  it('moves on as each thing is done', () => {
    expect(states(journey({})).terms).toBe('current');
    expect(states(journey({ termsAccepted: true })).apply).toBe('current');
    expect(states(journey({ termsAccepted: true, status: 'submitted', applicationStage: 'published_pending' }))).toMatchObject({
      apply: 'done',
      citizen: 'current',
    });
    expect(states(journey({ termsAccepted: true, status: 'public_member' })).citizen).toBe('current');
    const citizen = journey({ termsAccepted: true, status: 'citizen' });
    expect(states(citizen)).toEqual({ wallet: 'done', terms: 'done', apply: 'done', citizen: 'done', vote: 'current' });
    expect(journeyProgress(citizen)).toEqual({ done: 4, total: 5 });
  });

  it('does not hold someone back for skipping a step out of order', () => {
    // A citizen on a restored wallet, whose terms flag this phone has not seen.
    const steps = journey({ status: 'citizen' });
    expect(states(steps)).toMatchObject({ terms: 'done', apply: 'done', citizen: 'done', vote: 'current' });
  });

  it('offers to continue a saved introduction', () => {
    const apply = journey({ termsAccepted: true, applicationSaved: true }).find(step => step.key === 'apply');
    expect(apply.action).toBe('Continue');
    expect(apply.detail).toMatch(/saved on this phone/);
  });

  it('reads every application stage the server reports', () => {
    const at = applicationStage => states(journey({ termsAccepted: true, status: 'submitted', applicationStage }));
    expect(at(null)).toMatchObject({ apply: 'current', citizen: 'ahead' });
    expect(at('draft')).toMatchObject({ apply: 'current', citizen: 'ahead' });
    expect(at('published_pending')).toMatchObject({ apply: 'done', citizen: 'current' });
    expect(at('confirmed')).toMatchObject({ apply: 'done', citizen: 'current' });
    // Before anything is started the stage means nothing by itself.
    expect(states(journey({ termsAccepted: true, status: 'new', applicationStage: 'confirmed' })).apply).toBe('current');
  });

  // The server says 'submitted' once the first page is saved. That is not a
  // published introduction.
  it('does not tick the introduction while the server still holds only a draft', () => {
    const steps = journey({ termsAccepted: true, status: 'submitted', applicationStage: 'draft' });
    expect(states(steps)).toMatchObject({ terms: 'done', apply: 'current', citizen: 'ahead' });
    const apply = steps.find(step => step.key === 'apply');
    expect(apply).toMatchObject({ title: 'Finish your introduction', action: 'Continue', route: 'JoinGeneralPublicApplicationScreen' });
    expect(apply.detail).toMatch(/not published yet/);
    // Having started still counts as having met the community.
    expect(states(journey({ status: 'submitted', applicationStage: 'draft' })).terms).toBe('done');
  });

  it('on an older server, believes only a transaction this phone sent', () => {
    const base = { termsAccepted: true, status: 'submitted' };
    expect(states(journey(base)).apply).toBe('current');
    expect(states(journey({ ...base, publicationStatus: 'prepared' })).apply).toBe('current');
    expect(states(journey({ ...base, publicationStatus: 'pending' })).apply).toBe('current');
    expect(states(journey({ ...base, publicationStatus: 'submitted' }))).toMatchObject({ apply: 'done', citizen: 'current' });
    expect(journey({ ...base, applicationSaved: true }).find(step => step.key === 'apply').detail).toMatch(/saved on this phone/);
  });

  it('ticks the introduction once it is published, pending or confirmed', () => {
    const base = { termsAccepted: true, status: 'submitted' };
    for (const applicationStage of ['published_pending', 'confirmed']) {
      const steps = journey({ ...base, applicationStage });
      expect(states(steps)).toMatchObject({ apply: 'done', citizen: 'current' });
      expect(steps.find(step => step.key === 'apply').title).toBe('Introduce yourself');
    }
  });

  it('decides in one place whether an introduction was really made', () => {
    expect(introductionPublished({ status: 'submitted' })).toBe(false);
    expect(introductionPublished({ status: 'submitted', applicationStage: 'draft' })).toBe(false);
    expect(introductionPublished({ status: 'submitted', applicationStage: 'published_pending' })).toBe(true);
    expect(introductionPublished({ status: 'submitted', applicationStage: 'confirmed' })).toBe(true);
    // Just broadcast from this phone; the server has not caught up yet.
    expect(introductionPublished({ status: 'submitted', applicationStage: 'draft', publicationStatus: 'submitted' })).toBe(true);
    expect(introductionPublished({ status: 'new', publicationStatus: 'submitted' })).toBe(false);
    expect(introductionPublished({ status: 'public_member', applicationStage: 'draft' })).toBe(true);
    expect(introductionPublished({ status: 'citizen' })).toBe(true);
    expect(introductionPublished()).toBe(false);
  });

  it('gives every unfinished step somewhere to go', () => {
    for (const step of journey({})) if (!step.done) expect(step.route && step.action).toBeTruthy();
  });
});

describe('Using the app as a wallet only', () => {
  it('shows the path to a newcomer and lets them put it away', () => {
    expect(pathCard(journey({}))).toEqual({ mode: 'path', canSkip: true });
    expect(pathCard(journey({ termsAccepted: true, applicationSaved: true }))).toEqual({ mode: 'path', canSkip: true });
    expect(pathCard(journey({ termsAccepted: true, status: 'submitted', applicationStage: 'draft' }))).toEqual({
      mode: 'path',
      canSkip: true,
    });
  });

  it('replaces the path with an invitation once they choose the wallet only', () => {
    const walletOnly = { walletOnly: true };
    expect(pathCard(journey({}), walletOnly)).toEqual({ mode: 'invite', canSkip: false });
    expect(pathCard(journey({ termsAccepted: true }), walletOnly)).toEqual({ mode: 'invite', canSkip: false });
    expect(pathCard(journey({ termsAccepted: true, status: 'submitted', applicationStage: 'draft' }), walletOnly).mode).toBe('invite');
  });

  it('shows the path again once an introduction is published, whatever was chosen', () => {
    for (const walletOnly of [false, true]) {
      for (const input of [
        { termsAccepted: true, status: 'submitted', applicationStage: 'published_pending' },
        { termsAccepted: true, status: 'submitted', applicationStage: 'confirmed' },
        { status: 'public_member' },
      ]) {
        expect(pathCard(journey(input), { walletOnly })).toEqual({ mode: 'path', canSkip: false });
      }
    }
  });

  it('shows neither once only voting is left', () => {
    expect(pathCard(journey({ status: 'citizen' }))).toEqual({ mode: 'none', canSkip: false });
    expect(pathCard(journey({ status: 'citizen' }), { walletOnly: true })).toEqual({ mode: 'none', canSkip: false });
  });
});
