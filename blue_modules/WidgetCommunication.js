function WidgetCommunication(props) {
  return null;
}

// Android has no widget bridge. These methods must exist before the component
// mounts because wallet and exchange-rate updates call them during startup.
WidgetCommunication.isBalanceDisplayAllowed = () => false;
WidgetCommunication.setBalanceDisplayAllowed = () => {};
WidgetCommunication.reloadAllTimelines = () => {};

export default WidgetCommunication;
