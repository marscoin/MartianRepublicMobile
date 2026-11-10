import { INTRO_PAGES, TOTAL_STEPS, backupQuiz, journey, journeyProgress, ordinal } from '../../blue_modules/onboarding';

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

  it('starts a newcomer at getting Marscoin', () => {
    const steps = journey({});
    expect(states(steps)).toEqual({ wallet: 'done', funds: 'current', terms: 'ahead', apply: 'ahead', citizen: 'ahead', vote: 'ahead' });
    expect(steps.find(step => step.state === 'current')).toMatchObject({ action: 'Get Marscoin', route: 'SwapHome' });
    expect(journeyProgress(steps)).toEqual({ done: 1, total: 6 });
  });

  it('moves on as each thing is done', () => {
    expect(states(journey({ balance: 5000000 })).terms).toBe('current');
    expect(states(journey({ balance: 5000000, termsAccepted: true })).apply).toBe('current');
    expect(states(journey({ balance: 5000000, termsAccepted: true, status: 'submitted' }))).toMatchObject({
      apply: 'done',
      citizen: 'current',
    });
    expect(states(journey({ balance: 5000000, termsAccepted: true, status: 'public_member' })).citizen).toBe('current');
    expect(states(journey({ balance: 5000000, termsAccepted: true, status: 'citizen' }))).toMatchObject({
      citizen: 'done',
      vote: 'current',
    });
  });

  it('does not hold someone back for skipping a step out of order', () => {
    // Applied before ever holding a balance on this phone (a restored wallet, say).
    const steps = journey({ balance: 0, status: 'citizen' });
    expect(states(steps)).toMatchObject({ funds: 'current', terms: 'done', apply: 'done', citizen: 'done' });
  });

  it('offers to continue a saved introduction', () => {
    const apply = journey({ balance: 1, termsAccepted: true, applicationSaved: true }).find(step => step.key === 'apply');
    expect(apply.action).toBe('Continue');
    expect(apply.detail).toMatch(/saved on this phone/);
  });

  it('gives every unfinished step somewhere to go', () => {
    for (const step of journey({})) if (!step.done) expect(step.route && step.action).toBeTruthy();
  });
});
