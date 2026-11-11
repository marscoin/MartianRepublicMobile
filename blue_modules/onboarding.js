// The newcomer's path into the Republic: the words on each step, the check
// that the recovery phrase really was written down, and what comes next once
// inside. Kept apart from the screens so the wording can be edited, tested and
// later translated in one place.

// One idea per screen. The voice is that of the place itself: a working
// settlement registering a new arrival. Plain and unhurried, never salesy, and
// written for someone who has never used a wallet.
export const INTRO_PAGES = [
  {
    key: 'welcome',
    art: 'horizon',
    eyebrow: 'ARRIVAL',
    title: 'You made it to Mars.',
    body: [
      'Out here nobody opens an account for you. You carry your own money and your own papers, and the Republic knows you by them.',
      'This will set you up with both. It takes about three minutes.',
    ],
    action: 'Begin registration',
  },
  {
    key: 'wallet',
    art: 'vault',
    eyebrow: 'YOUR WALLET',
    title: 'What you carry is yours.',
    body: [
      'There is no bank behind this wallet and no office holding your funds. It lives on this device and answers only to you.',
      'Nobody can freeze it. Nobody can reset it for you, either.',
    ],
    action: 'Continue',
  },
  {
    key: 'phrase',
    art: 'key',
    eyebrow: 'YOUR KEY',
    title: 'Twelve words. Guard them.',
    body: [
      'Your wallet and your civic identity are sealed with twelve ordinary words. Whoever holds them is you, as far as Mars is concerned.',
    ],
    rules: [
      'Write them on paper, in order.',
      'Show them to no one. The Republic will never ask for them.',
      'Lose this device and the words bring everything back. Lose the words as well, and nothing can.',
    ],
    action: 'Show me my words',
  },
];

export const TOTAL_STEPS = 7;

// Which words to ask for, and what to offer as answers. `pick(n)` returns a
// whole number from 0 to n-1; passing it in keeps this testable.
export function backupQuiz(words, pick, rounds = 3, choices = 4) {
  if (!Array.isArray(words) || words.length < choices) throw new Error('A recovery phrase is required.');
  const positions = [];
  while (positions.length < Math.min(rounds, words.length)) {
    const position = pick(words.length);
    if (!positions.includes(position)) positions.push(position);
  }
  return positions
    .sort((a, b) => a - b)
    .map(position => {
      const answer = words[position];
      // Wrong answers come from the phrase itself, so the person has to know
      // the order, not merely recognise a word.
      const others = [];
      const candidates = words.filter(word => word !== answer);
      while (others.length < choices - 1 && candidates.length) {
        const [word] = candidates.splice(pick(candidates.length), 1);
        if (!others.includes(word)) others.push(word);
      }
      const options = [...others];
      options.splice(pick(choices), 0, answer);
      return { position, number: position + 1, answer, options };
    });
}

export const ordinal = number => {
  const tens = number % 100;
  if (tens >= 11 && tens <= 13) return `${number}th`;
  return `${number}${['th', 'st', 'nd', 'rd'][number % 10] || 'th'}`;
};

// The journey after setup, as shown on the home screen. Each step is done,
// current (the one to do now) or ahead.
//
// The server marks an application 'submitted' as soon as its first page is
// saved, long before anything is published. So 'submitted' alone proves
// nothing: the introduction counts as made only when the server says it was
// published (`applicationStage`, absent on older servers) or this phone
// itself sent the transaction (`publicationStatus` from the saved draft).
export function introductionPublished({ status = null, applicationStage = null, publicationStatus = null } = {}) {
  if (['public_member', 'citizen'].includes(status)) return true;
  if (status !== 'submitted') return false;
  return ['published_pending', 'confirmed'].includes(applicationStage) || publicationStatus === 'submitted';
}

export function journey({
  balance = 0,
  termsAccepted = false,
  status = null,
  applicationSaved = false,
  applicationStage = null,
  publicationStatus = null,
} = {}) {
  const started = ['submitted', 'public_member', 'citizen'].includes(status);
  const applied = introductionPublished({ status, applicationStage, publicationStatus });
  const unfinished = started && !applied;
  const member = ['public_member', 'citizen'].includes(status);
  const steps = [
    { key: 'wallet', title: 'Create your wallet', detail: 'Done. Keep your twelve words safe.', done: true },
    {
      key: 'funds',
      title: 'Get your first Marscoin',
      detail: 'Swap a little Bitcoin, or ask a citizen to send you some. A fraction of one Marscoin covers your application.',
      done: balance > 0,
      action: 'Get Marscoin',
      route: 'SwapHome',
    },
    {
      key: 'terms',
      title: 'Meet the community',
      detail: 'Read the short community terms and see who is already here.',
      done: termsAccepted || started,
      action: 'Open the community',
      route: 'CitizenScreen',
    },
    {
      key: 'apply',
      title: unfinished ? 'Finish your introduction' : 'Introduce yourself',
      detail: applicationSaved
        ? 'Your introduction is saved on this phone. Pick up where you left off.'
        : unfinished
          ? 'You have started your introduction, but it is not published yet. Pick up where you left off.'
          : 'A name, a photo and a few words. It is published on the Marscoin chain as your public record.',
      done: applied,
      action: applicationSaved || unfinished ? 'Continue' : 'Start',
      route: 'JoinGeneralPublicApplicationScreen',
    },
    {
      key: 'citizen',
      title: 'Become a citizen',
      detail: 'Citizens endorse newcomers they recognise as real people. Say hello in the Public Square.',
      done: status === 'citizen',
      action: 'Public Square',
      route: 'PublicSquare',
    },
    {
      key: 'vote',
      title: 'Vote',
      detail: member ? 'Citizens vote on proposals. See what is being decided.' : 'Citizens vote on proposals. You can already read them.',
      done: false,
      action: 'See proposals',
      route: 'Proposals',
    },
  ];
  const current = steps.findIndex(step => !step.done);
  return steps.map((step, index) => ({ ...step, state: step.done ? 'done' : index === current ? 'current' : 'ahead' }));
}

export const journeyProgress = steps => ({ done: steps.filter(step => step.done).length, total: steps.length });
