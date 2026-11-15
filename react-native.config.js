// react-native.config.js
module.exports = {
  assets: [ './assets/fonts/' ],
  dependencies: {
    'rn-ldk': {
      platforms: {
        ios: null, // Disable autolinking for ios
        // No JavaScript calls rn-ldk, and its prebuilt Android library is not 16 KB page aligned.
        android: null,
      },
    },
  },
};
