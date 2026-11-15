/**
 * React 19 no longer applies `defaultProps` to function, forwardRef and memo components.
 * Several libraries this app depends on (react-native-elements 3, react-native-modal,
 * react-native-dialog, ...) and App.js (`Text.defaultProps.allowFontScaling`) still rely on it,
 * and without it they render with undefined sizes and colours.
 *
 * This restores the React 18 behaviour at the point where elements are created.
 * Class components are left alone: React still resolves their defaultProps itself.
 */
/* global __DEV__ */
const React = require('react');

function withDefaultProps(type, props) {
  if (type === null || (typeof type !== 'function' && typeof type !== 'object')) return props;
  const defaults = type.defaultProps;
  if (!defaults) return props;
  if (typeof type === 'function' && type.prototype && type.prototype.isReactComponent) return props;
  let result = props;
  for (const name in defaults) {
    if (result == null || result[name] === undefined) {
      if (result === props) result = { ...props };
      result[name] = defaults[name];
    }
  }
  return result;
}

function patch(target, method) {
  const original = target && target[method];
  if (typeof original !== 'function' || original.__appliesDefaultProps) return;
  const patched = function (type, props, ...rest) {
    return original.call(this, type, withDefaultProps(type, props), ...rest);
  };
  patched.__appliesDefaultProps = true;
  target[method] = patched;
}

patch(React, 'createElement');
const jsxRuntime = require('react/jsx-runtime');
patch(jsxRuntime, 'jsx');
patch(jsxRuntime, 'jsxs');
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  patch(require('react/jsx-dev-runtime'), 'jsxDEV');
}

module.exports = { withDefaultProps };
