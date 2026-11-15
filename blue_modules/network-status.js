// The services this app talks to, and how to ask each one whether it is there.
// Every probe is a real request the app makes anyway; nothing is simulated.
// Pure: `fetch` and the two Electrum callers are passed in.

const within = (promise, milliseconds) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('No answer in time.')), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
};

const group = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function networkNodes({ fetch, relayTip, walletServer, quantumPeers }) {
  const json = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Answered with error ${response.status}.`);
    return response.json();
  };
  const text = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Answered with error ${response.status}.`);
    return response.text();
  };
  return [
    {
      id: 'wallet',
      short: 'Wallet',
      chain: 'mars',
      name: 'Your wallet’s Marscoin server',
      role: 'Balances, history and sending Marscoin. You can change it in Settings.',
      probe: async () => {
        const server = await walletServer();
        return { host: server.host, detail: 'Connected' };
      },
    },
    {
      id: 'relay',
      short: 'Relay',
      chain: 'mars',
      name: 'Swap relay and watchtower',
      host: 'electrum.marscoin.org',
      role: 'Carries swap offers between wallets and finishes a swap for you if your phone is off. It never holds coins.',
      probe: async () => ({ marsHeight: await relayTip(), detail: 'Order book open' }),
    },
    {
      id: 'explorer',
      short: 'Explorer',
      chain: 'mars',
      name: 'Marscoin explorer',
      host: 'explore.marscoin.org',
      role: 'A separate full node. The app checks what the relay says against it before you pay in a swap.',
      probe: async () => {
        const blocks = (await json('https://explore.marscoin.org/api/status'))?.info?.blocks;
        if (!Number.isSafeInteger(blocks)) throw new Error('Unexpected answer.');
        return { marsHeight: blocks, detail: `Block ${group(blocks)}` };
      },
    },
    {
      id: 'republic',
      short: 'Republic',
      chain: 'republic',
      name: 'Martian Republic',
      host: 'martianrepublic.org',
      role: 'Citizens, proposals, the public square and your organizations.',
      probe: async () => {
        const page = await json('https://martianrepublic.org/api/congress/proposals?per_page=1');
        return { detail: Number.isFinite(page?.total) ? `${page.total} proposals on record` : 'Answering' };
      },
    },
    {
      id: 'maker',
      short: 'Maker',
      chain: 'republic',
      name: 'Open market maker',
      host: 'swaps.marscoin.org',
      role: 'An always-on seller of Marscoin for Bitcoin. Anyone can run one; this is the first.',
      probe: async () => {
        const snapshot = await json('https://swaps.marscoin.org/api/snapshot');
        const offers = snapshot?.maker?.offers?.length || 0;
        return { detail: snapshot?.mode === 'live' ? `${offers} offer${offers === 1 ? '' : 's'} open` : 'Not trading right now' };
      },
    },
    ...(quantumPeers
      ? [
          {
            id: 'quantum',
            short: 'Quantum net',
            chain: 'quantum',
            name: 'Marsqnet, the quantum test network',
            host: 'marsqnet',
            role:
              'Marscoin’s post-quantum test network: RandomX mining and signatures built to withstand quantum computers. ' +
              'Your phone only greets its nodes and asks how far their chain has come. No coins are involved.',
            probe: async () => {
              // [{ height, agent } | null] per node.
              const answers = (await quantumPeers()).filter(Boolean);
              if (!answers.length) throw new Error('None of its nodes answered.');
              const height = Math.max(...answers.map(answer => answer.height));
              return {
                quantumHeight: height,
                host: answers[0].agent.replace(/^\/|\/$/g, ''),
                detail: `Block ${group(height)} · ${answers.length} node${answers.length === 1 ? '' : 's'} answering`,
              };
            },
          },
        ]
      : []),
    {
      id: 'mempool',
      short: 'Bitcoin A',
      chain: 'btc',
      name: 'Bitcoin service A',
      host: 'mempool.space',
      role: 'One of two independent views of the Bitcoin chain. Both must agree before a swap acts.',
      probe: async () => {
        const height = Number(await text('https://mempool.space/api/blocks/tip/height'));
        if (!Number.isSafeInteger(height)) throw new Error('Unexpected answer.');
        return { btcHeight: height, detail: `Block ${group(height)}` };
      },
    },
    {
      id: 'blockstream',
      short: 'Bitcoin B',
      chain: 'btc',
      name: 'Bitcoin service B',
      host: 'blockstream.info',
      role: 'The second independent view of the Bitcoin chain.',
      probe: async () => {
        const height = Number(await text('https://blockstream.info/api/blocks/tip/height'));
        if (!Number.isSafeInteger(height)) throw new Error('Unexpected answer.');
        return { btcHeight: height, detail: `Block ${group(height)}` };
      },
    },
  ];
}

// Ask one node. Resolves, never rejects: { id, ok, ms, ...answer } or { id, ok: false, error }.
export async function probeNode(node, { now = Date.now, timeout = 12000 } = {}) {
  const started = now();
  try {
    const answer = await within(node.probe(), timeout);
    return { id: node.id, ok: true, ms: Math.max(1, now() - started), ...answer };
  } catch (error) {
    return { id: node.id, ok: false, ms: null, error: error?.message || 'No answer.' };
  }
}

// One line for the whole picture.
export function networkSummary(results) {
  const known = results.filter(Boolean);
  if (!known.length) return { tone: 'idle', text: 'Checking your connections…' };
  const down = known.filter(result => !result.ok).length;
  if (!down) return { tone: 'good', text: `All ${known.length} connections are answering.` };
  if (down === known.length) return { tone: 'bad', text: 'Nothing is answering. Check your internet connection.' };
  return { tone: 'warn', text: `${known.length - down} of ${known.length} connections are answering.` };
}

// How long a pulse takes to travel a link, from the measured response time:
// a quick server sends quick pulses.
export const pulseDuration = ms => (ms ? Math.min(3200, Math.max(700, 500 + ms * 2.2)) : 0);

// Positions on a ring, as fractions of the canvas, starting at the top.
export function ringPositions(count, radius = 0.38) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return { x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) };
  });
}
