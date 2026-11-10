// Keep wallet cryptography and session checks offline and independent of native
// modules. The inherited BlueWallet integration suite opens network connections.
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/wallet/*.test.js'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: ['module:metro-react-native-babel-preset'],
      },
    ],
  },
  clearMocks: true,
};
