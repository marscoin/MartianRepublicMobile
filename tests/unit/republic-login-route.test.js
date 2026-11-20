import assert from 'assert';
import DeeplinkSchemaMatch from '../../class/deeplink-schema-match';

// tests/unit/deeplink-schema-match.test.js cannot load the wallet classes (a circular import that predates this
// test), so they are stood in for here; the routing under test is real.
jest.mock('../../class', () => ({
  LightningCustodianWallet: class {},
  WatchOnlyWallet: class {
    setSecret() {
      return this;
    }

    init() {
      return this;
    }

    valid() {
      return false;
    }
  },
}));
jest.mock('../../BlueApp', () => ({ AppStorage: {} }));
jest.mock('../../blue_modules/fs', () => ({ readFileOutsideSandbox: jest.fn() }));

describe('unit - the Martian Republic sign-in code from the scanner', () => {
  const code = 'https://martianrepublic.org/api/marsauth?sid=1795689600_0123456789abcdef0123&c=fedcba9876543210fedc_1795689600&t=6b3e5d80';

  it('opens the sign-in confirmation for the website code, and nothing for a look-alike', () => {
    const routes = [];
    DeeplinkSchemaMatch.navigationRouteFor({ url: code }, route => routes.push(route));
    assert.deepStrictEqual(routes, [['RepublicLogin', { url: code }]]);

    const elsewhere = [];
    for (const url of [
      code.replace('martianrepublic.org', 'martianrepub1ic.org'),
      code.replace('https:', 'http:'),
      code.replace('/marsauth', '/token'),
    ]) {
      DeeplinkSchemaMatch.navigationRouteFor({ url }, route => elsewhere.push(route));
    }
    assert.deepStrictEqual(elsewhere, []);
  });

  it('still sends a Bitcoin address to the send screen', () => {
    const routes = [];
    DeeplinkSchemaMatch.navigationRouteFor({ url: '12eQ9m4sgAwTSQoNXkRABKhCXCsjm2jdVG' }, route => routes.push(route));
    assert.strictEqual(routes[0][0], 'SendDetailsRoot');
  });
});

describe('unit - the sign-in screen is reachable where citizens are', () => {
  // Citizens run on InitRoot's tabs, not on RootStack. On 20 November 2026 the screen was registered only in
  // RootStack, and navigating to it from the Scan tab did nothing on a phone (an unhandled action is silent in release).
  it('is registered next to the citizen tabs in InitRoot', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../../Navigation.tsx'), 'utf8');
    const initRoot = source.slice(source.indexOf('const InitRoot = () => {'), source.indexOf('</InitStack.Navigator>'));
    assert.ok(initRoot.includes('<InitStack.Screen name="BottomTabs"'));
    assert.ok(initRoot.includes('<InitStack.Screen name="RepublicLogin" component={RepublicLoginScreen}'));
  });
});
