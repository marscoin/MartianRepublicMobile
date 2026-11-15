jest.mock('../../blue_modules/MARSConnection', () => ({
  estimateFees: jest.fn(async () => ({ fast: 2, medium: 1, slow: 1 })),
}));

const { explorerRecommendedRate, default: NetworkTransactionFees } = require('../../models/networkTransactionFees');

const answer = body => async () => ({ ok: true, json: async () => body });

describe('network fee from the explorer', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('uses the recommended rate', async () => {
    expect(await explorerRecommendedRate(answer({ recommendedZubrinsPerByte: 2, minimumZubrinsPerByte: 1 }))).toBe(2);
  });

  it('never goes below the minimum the explorer reports', async () => {
    expect(await explorerRecommendedRate(answer({ recommendedZubrinsPerByte: 2, minimumZubrinsPerByte: 5 }))).toBe(5);
  });

  it('rounds a fractional rate up', async () => {
    expect(await explorerRecommendedRate(answer({ recommendedZubrinsPerByte: 1.2 }))).toBe(2);
  });

  it.each([[{}], [{ recommendedZubrinsPerByte: 0 }], [{ recommendedZubrinsPerByte: 'x' }], [{ recommendedZubrinsPerByte: 5000000 }], [null]])(
    'ignores an implausible answer %j',
    async body => {
      expect(await explorerRecommendedRate(answer(body))).toBeNull();
    },
  );

  it('ignores a failed or unreachable explorer', async () => {
    expect(await explorerRecommendedRate(async () => ({ ok: false, json: async () => ({}) }))).toBeNull();
    expect(
      await explorerRecommendedRate(async () => {
        throw new Error('offline');
      }),
    ).toBeNull();
  });

  it('offers the explorer rate for sending', async () => {
    global.fetch = answer({ recommendedZubrinsPerByte: 3, minimumZubrinsPerByte: 1 });
    expect(await NetworkTransactionFees.recommendedFees()).toEqual({ fastestFee: 3, mediumFee: 3, slowFee: 1 });
  });

  it('falls back to the wallet server estimate when the explorer is down', async () => {
    global.fetch = async () => {
      throw new Error('offline');
    };
    expect(await NetworkTransactionFees.recommendedFees()).toEqual({ fastestFee: 7, mediumFee: 3, slowFee: 1 });
  });
});
