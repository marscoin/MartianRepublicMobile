/**
 * Metro configuration for React Native
 * https://reactnative.dev/docs/metro
 *
 * @format
 */
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const extraNodeModules = require('node-libs-browser');

const defaultConfig = getDefaultConfig(__dirname);
const windowsDir = path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/');
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = {
  resolver: {
    blockList: [
      ...[defaultConfig.resolver.blockList].flat().filter(Boolean),
      // This stops "react-native run-windows" from causing the metro server to crash if its already running
      new RegExp(`${escapeRegExp(windowsDir)}.*`),
      // This prevents "react-native run-windows" from hitting: EBUSY: resource busy or locked, open msbuild.ProjectImports.zip
      /.*\.ProjectImports\.zip/,
    ],
    extraNodeModules: {
      stream: extraNodeModules.stream,
    },
    // Resolve packages through "main", "browser" and "react-native" as React Native 0.72 did.
    // The crypto and stream shims in package.json were chosen for that resolution.
    unstable_enablePackageExports: false,
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(defaultConfig, config);
