import { swapSubsteps } from '../../blue_modules/swap/present';

const states = swap => swapSubsteps(swap).map(part => part.state);

describe('what a swap is doing right now', () => {
  it('walks through the Marscoin lock one confirmation at a time', () => {
    const waiting = lockProgress => ({ state: 'waiting_mars', lockProgress });
    expect(states(waiting(undefined))).toEqual(['active', 'todo', 'todo', 'todo']);
    expect(states(waiting({ seen: true, confirmations: 0 }))).toEqual(['done', 'active', 'todo', 'todo']);
    expect(states(waiting({ seen: true, confirmations: 1 }))).toEqual(['done', 'done', 'active', 'todo']);
    expect(states(waiting({ seen: true, confirmations: 2 }))).toEqual(['done', 'done', 'done', 'active']);
    expect(swapSubsteps(waiting({ seen: true, confirmations: 1 }))[2].label).toBe('Second confirmation');
  });

  it('shows exactly one part in progress in every unfinished state', () => {
    for (const state of ['accepting', 'waiting_mars', 'ready_to_pay', 'btc_sent', 'claiming', 'refunding']) {
      const list = states({ state, btcPayment: null, marsClaim: null, btcRefunds: [] });
      expect(list.filter(item => item === 'active')).toHaveLength(1);
      expect(list.indexOf('todo') === -1 || list.indexOf('todo') > list.indexOf('active')).toBe(true);
    }
  });

  it('says whose turn it is when it is time to pay', () => {
    expect(swapSubsteps({ state: 'ready_to_pay', btcPayment: null })[1]).toEqual({ label: 'Your turn: pay the Bitcoin', state: 'active' });
    expect(swapSubsteps({ state: 'ready_to_pay', btcPayment: { hex: '00' } })[1].label).toBe('Sending your Bitcoin');
  });

  it('has nothing to add once a swap is settled', () => {
    for (const state of ['completed', 'refunded', 'failed', 'unclaimed']) expect(swapSubsteps({ state })).toEqual([]);
  });
});
