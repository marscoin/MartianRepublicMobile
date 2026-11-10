// The call side of the themed dialog (components/MarsDialog.js), kept free of
// UI imports so that non-visual modules can raise a dialog too.
// `marsAlert` takes the same arguments as React Native's Alert.alert. Until a
// dialog host registers (unit tests, very early startup) the system alert is used.
import { Alert } from 'react-native';

let host = null;
const queue = [];

export function marsAlert(...args) {
  if (!host) return Alert.alert(...args);
  const [title, message, buttons] = args;
  queue.push({ title, message, buttons });
  host.next();
}

// The host passes { next } to register and null to step down.
export function setDialogHost(value) {
  host = value;
}

export const takeDialog = () => queue.shift();
export const hasDialogs = () => queue.length > 0;
