import { marsAlert } from '../../components/MarsDialog';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ActivityIndicator, View, StyleSheet, Text, Keyboard, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import DefaultPreference from 'react-native-default-preference';
import AsyncStorage from '@react-native-async-storage/async-storage';
import loc from '../../loc';
import DeeplinkSchemaMatch from '../../class/deeplink-schema-match';
import { BlueDoneAndDismissKeyboardInputAccessory, BlueDismissKeyboardInputAccessory } from '../../BlueComponents';
import { CivicButton } from '../../components/CivicUi';
import {
  SettingsCard,
  SettingsField,
  SettingsLink,
  SettingsRow,
  SettingsScreen,
  SettingsSection,
  SettingsSwitchRow,
  settingsColors,
  settingsNavigation,
} from '../../components/SettingsUi';
import WidgetCommunication from '../../blue_modules/WidgetCommunication';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import presentAlert from '../../components/Alert';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';

const BlueElectrum = require('../../blue_modules/BlueElectrum');

export default class ElectrumSettings extends Component {
  static contextType = BlueStorageContext;
  constructor(props) {
    super(props);
    const server = props?.route?.params?.server;
    this.state = {
      isLoading: true,
      isOfflineMode: false,
      serverHistory: [],
      config: {},
      server,
      sslPort: '',
      port: '',
    };
  }

  componentWillUnmount() {
    clearInterval(this.state.inverval);
  }

  async componentDidMount() {
    const host = await AsyncStorage.getItem(BlueElectrum.ELECTRUM_HOST);
    const port = await AsyncStorage.getItem(BlueElectrum.ELECTRUM_TCP_PORT);
    const sslPort = await AsyncStorage.getItem(BlueElectrum.ELECTRUM_SSL_PORT);
    const serverHistoryStr = await AsyncStorage.getItem(BlueElectrum.ELECTRUM_SERVER_HISTORY);
    const isOfflineMode = await BlueElectrum.isDisabled();
    const serverHistory = JSON.parse(serverHistoryStr) || [];
    this.setState({
      isLoading: false,
      host,
      port,
      sslPort,
      serverHistory,
      isOfflineMode,
      isAndroidNumericKeyboardFocused: false,
      isAndroidAddressKeyboardVisible: false,
    });

    const inverval = setInterval(async () => {
      this.setState({
        config: await this.readConfig(),
      });
    }, 500);

    this.setState({
      config: await this.readConfig(),
      inverval,
    });

    if (this.state.server) {
      triggerHapticFeedback(HapticFeedbackTypes.ImpactHeavy);
      marsAlert(
        loc.formatString(loc.settings.set_electrum_server_as_default, { server: this.state.server }),
        '',
        [
          {
            text: loc._.ok,
            onPress: () => {
              this.onBarScanned(this.state.server);
            },
            style: 'default',
          },
          { text: loc._.cancel, onPress: () => {}, style: 'cancel' },
        ],
        { cancelable: false },
      );
    }
  }

  // There is no configuration to read while nothing is connected.
  readConfig = async () => {
    try {
      return (await BlueElectrum.getConfig()) || {};
    } catch (_) {
      return {};
    }
  };

  checkServer = async () => {
    this.setState({ isLoading: true }, async () => {
      const features = await BlueElectrum.serverFeatures();
      triggerHapticFeedback(HapticFeedbackTypes.NotificationWarning);
      presentAlert({ message: JSON.stringify(features, null, 2) });
      this.setState({ isLoading: false });
    });
  };

  selectServer = async server => {
    this.setState({ host: server.host, port: server.port, sslPort: server.sslPort }, () => {
      this.save();
    });
  };

  clearHistoryAlert() {
    triggerHapticFeedback(HapticFeedbackTypes.ImpactHeavy);
    marsAlert(loc.settings.electrum_clear_alert_title, loc.settings.electrum_clear_alert_message, [
      { text: loc.settings.electrum_clear_alert_cancel, onPress: () => console.log('Cancel Pressed'), style: 'cancel' },
      { text: loc.settings.electrum_clear_alert_ok, onPress: () => this.clearHistory() },
    ]);
  }

  clearHistory = async () => {
    this.setState({ isLoading: true }, async () => {
      await AsyncStorage.setItem(BlueElectrum.ELECTRUM_SERVER_HISTORY, JSON.stringify([]));
      this.setState({
        serverHistory: [],
        isLoading: false,
      });
    });
  };

  resetToDefault = async () => {
    this.setState({ port: '', host: '', sslPort: '' }, () => {
      this.save();
    });
  };

  serverExists = server => {
    const { serverHistory } = this.state;
    return serverHistory.some(s => {
      return `${s.host}${s.port}${s.sslPort}` === `${server.host}${server.port}${server.sslPort}`;
    });
  };

  save = () => {
    const host = this.state.host ? this.state.host : '';
    const port = this.state.port ? this.state.port : '';
    const sslPort = this.state.sslPort ? this.state.sslPort : '';
    const serverHistory = this.state.serverHistory || [];

    this.setState({ isLoading: true }, async () => {
      try {
        if (!host && !port && !sslPort) {
          await AsyncStorage.setItem(BlueElectrum.ELECTRUM_HOST, '');
          await AsyncStorage.setItem(BlueElectrum.ELECTRUM_TCP_PORT, '');
          await AsyncStorage.setItem(BlueElectrum.ELECTRUM_SSL_PORT, '');
          try {
            await DefaultPreference.setName('group.io.bluewallet.bluewallet');
            await DefaultPreference.clear(BlueElectrum.ELECTRUM_HOST);
            await DefaultPreference.clear(BlueElectrum.ELECTRUM_SSL_PORT);
            await DefaultPreference.clear(BlueElectrum.ELECTRUM_TCP_PORT);
            WidgetCommunication.reloadAllTimelines();
          } catch (e) {
            // Must be running on Android
            console.log(e);
          }
          triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
          presentAlert({ message: loc.settings.electrum_saved });
        } else if (!(await BlueElectrum.testConnection(host, port, sslPort))) {
          triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
          presentAlert({ message: loc.settings.electrum_error_connect });
        } else {
          await AsyncStorage.setItem(BlueElectrum.ELECTRUM_HOST, host);
          await AsyncStorage.setItem(BlueElectrum.ELECTRUM_TCP_PORT, port);
          await AsyncStorage.setItem(BlueElectrum.ELECTRUM_SSL_PORT, sslPort);

          if (!this.serverExists({ host, port, sslPort })) {
            serverHistory.push({
              host,
              port,
              sslPort,
            });
            await AsyncStorage.setItem(BlueElectrum.ELECTRUM_SERVER_HISTORY, JSON.stringify(serverHistory));
          }

          try {
            await DefaultPreference.setName('group.io.bluewallet.bluewallet');
            await DefaultPreference.set(BlueElectrum.ELECTRUM_HOST, host);
            await DefaultPreference.set(BlueElectrum.ELECTRUM_TCP_PORT, port);
            await DefaultPreference.set(BlueElectrum.ELECTRUM_SSL_PORT, sslPort);
            WidgetCommunication.reloadAllTimelines();
          } catch (e) {
            // Must be running on Android
            console.log(e);
          }
          triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
          presentAlert({ message: loc.settings.electrum_saved });
        }
      } catch (error) {
        triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
        presentAlert({ message: error });
      }
      this.setState({ isLoading: false });
    });
  };

  onBarScanned = value => {
    if (DeeplinkSchemaMatch.getServerFromSetElectrumServerAction(value)) {
      // in case user scans a QR with a deeplink like `bluewallet:setelectrumserver?server=electrum1.bluewallet.io%3A443%3As`
      value = DeeplinkSchemaMatch.getServerFromSetElectrumServerAction(value);
    }
    const [host, port, type] = value.split(':');
    this.setState({ host, sslPort: '', port: '' }, () => {
      type === 's' ? this.setState({ sslPort: port }) : this.setState({ port });
    });
  };

  importScan = () => {
    requestCameraAuthorization().then(() =>
      this.props.navigation.navigate('ScanQRCodeRoot', {
        screen: 'ScanQRCode',
        params: {
          launchedBy: this.props.route.name,
          onBarScanned: this.onBarScanned,
          showFileImportButton: true,
        },
      }),
    );
  };

  useSSLPortToggled = value => {
    switch (value) {
      case true:
        this.setState(prevState => {
          return { port: '', sslPort: prevState.port };
        });
        break;
      case false:
        this.setState(prevState => {
          return { port: prevState.sslPort, sslPort: '' };
        });
        break;
    }
  };

  onElectrumConnectionEnabledSwitchValueChanged = async value => {
    if (value === true) {
      await BlueElectrum.setDisabled(true);
      this.context.setIsElectrumDisabled(true);
      BlueElectrum.forceDisconnect();
    } else {
      await BlueElectrum.setDisabled(false);
      this.context.setIsElectrumDisabled(false);
      BlueElectrum.connectMain();
    }
    this.setState({ isOfflineMode: value });
  };

  renderStatus = () => {
    const { config, isOfflineMode } = this.state;
    const connected = !isOfflineMode && config.connected === 1;
    const server = config.host ? `${config.host}:${config.port}` : '';
    return (
      <SettingsCard>
        <View style={styles.statusRow}>
          <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.statusText} testID="ElectrumStatus">
            {isOfflineMode ? 'Offline mode is on' : connected ? loc.settings.electrum_connected : loc.settings.electrum_connected_not}
          </Text>
        </View>
        {!isOfflineMode && server ? (
          <Text style={styles.hostname} onPress={this.checkServer} numberOfLines={1} ellipsizeMode="middle" testID="ElectrumHost">
            {server}
          </Text>
        ) : null}
        <Text style={styles.statusNote}>
          {isOfflineMode
            ? 'Balances and transactions are not being updated.'
            : connected
              ? 'The app chose this server and will move to another by itself if this one stops answering.'
              : 'The app keeps trying by itself. You do not need to do anything.'}
        </Text>
      </SettingsCard>
    );
  };

  renderElectrumSettings = () => {
    const usesSSL = this.state.sslPort?.trim() > 0;
    return (
      <>
        <SettingsSection label="YOUR OWN SERVER" />
        <KeyboardAvoidingView>
          <SettingsCard style={styles.form}>
            <Text style={styles.formNote}>
              Optional. Leave these empty and the app uses its own servers. Fill them in only if you run a Marscoin Electrum server
              yourself.
            </Text>
            <SettingsField
              label="ADDRESS"
              placeholder={loc.formatString(loc.settings.electrum_host, { example: '10.20.30.40' })}
              value={this.state.host}
              onChangeText={text => {
                const host = text.trim();
                this.setState({ host }, () => {
                  if (host.endsWith('.onion')) {
                    this.useSSLPortToggled(false);
                  }
                });
              }}
              editable={!this.state.isLoading}
              inputAccessoryViewID={BlueDoneAndDismissKeyboardInputAccessory.InputAccessoryViewID}
              testID="HostInput"
              onFocus={() => this.setState({ isAndroidAddressKeyboardVisible: true })}
              onBlur={() => this.setState({ isAndroidAddressKeyboardVisible: false })}
            />
            <View style={styles.portWrap}>
              <View style={styles.flex}>
                <SettingsField
                  label="PORT"
                  placeholder={loc.formatString(loc.settings.electrum_port, { example: '50001' })}
                  value={this.state.sslPort?.trim() === '' || this.state.sslPort === null ? this.state.port : this.state.sslPort}
                  onChangeText={text =>
                    this.setState(prevState => {
                      if (prevState.sslPort?.trim() === '') {
                        return { port: text.trim(), sslPort: '' };
                      } else {
                        return { port: '', sslPort: text.trim() };
                      }
                    })
                  }
                  editable={!this.state.isLoading}
                  keyboardType="number-pad"
                  inputAccessoryViewID={BlueDismissKeyboardInputAccessory.InputAccessoryViewID}
                  testID="PortInput"
                  onFocus={() => this.setState({ isAndroidNumericKeyboardFocused: true })}
                  onBlur={() => this.setState({ isAndroidNumericKeyboardFocused: false })}
                />
              </View>
              <View style={styles.ssl}>
                <Text style={styles.usePort}>{loc.settings.use_ssl}</Text>
                <Switch
                  testID="SSLPortInput"
                  accessibilityLabel={loc.settings.use_ssl}
                  value={usesSSL}
                  onValueChange={this.useSSLPortToggled}
                  disabled={this.state.host?.endsWith('.onion') ?? false}
                  trackColor={SWITCH_TRACK}
                  thumbColor={settingsColors.text}
                  ios_backgroundColor={settingsColors.border}
                />
              </View>
            </View>
            <View style={styles.actions}>
              {this.state.isLoading ? (
                <ActivityIndicator color={settingsColors.orange} testID="ElectrumSaving" />
              ) : (
                <CivicButton testID="Save" onPress={this.save} title={loc.settings.save} />
              )}
            </View>
            <SettingsLink title="Scan a server code" onPress={this.importScan} testID="ElectrumScan" />
            <SettingsLink title="Go back to the app’s servers" onPress={() => this.resetToDefault()} testID="ResetToDefault" />
          </SettingsCard>
          {Platform.select({
            ios: <BlueDismissKeyboardInputAccessory />,
            android: this.state.isAndroidNumericKeyboardFocused && <BlueDismissKeyboardInputAccessory />,
          })}

          {Platform.select({
            ios: (
              <BlueDoneAndDismissKeyboardInputAccessory
                onClearTapped={() => this.setState({ host: '' })}
                onPasteTapped={text => {
                  this.setState({ host: text });
                  Keyboard.dismiss();
                }}
              />
            ),
            android: this.state.isAndroidAddressKeyboardVisible && (
              <BlueDoneAndDismissKeyboardInputAccessory
                onClearTapped={() => {
                  this.setState({ host: '' });
                  Keyboard.dismiss();
                }}
                onPasteTapped={text => {
                  this.setState({ host: text });
                  Keyboard.dismiss();
                }}
              />
            ),
          })}
        </KeyboardAvoidingView>
        {this.state.serverHistory.length > 0 && !this.state.isLoading && (
          <SettingsSection
            label="SERVERS YOU HAVE USED"
            action={loc.settings.electrum_clear}
            onAction={() => this.clearHistoryAlert()}
            actionTestID="ElectrumClearHistory"
          >
            {this.state.serverHistory.map((server, i) => (
              <SettingsRow
                key={i}
                title={`${server.host}:${server.port || server.sslPort}`}
                value={loc.settings.electrum_select}
                onPress={() => this.selectServer(server)}
                chevron={false}
              />
            ))}
          </SettingsSection>
        )}
      </>
    );
  };

  render() {
    return (
      <SettingsScreen overline="MCR / SETTINGS / NETWORK" title="Marscoin server" keyboardShouldPersistTaps="always">
        {this.renderStatus()}
        <SettingsSection>
          <SettingsSwitchRow
            icon="wifi-off"
            title={loc.settings.electrum_offline_mode}
            note={loc.settings.electrum_offline_description}
            value={this.state.isOfflineMode}
            onValueChange={this.onElectrumConnectionEnabledSwitchValueChanged}
            switchTestID="ElectrumConnectionEnabledSwitch"
          />
        </SettingsSection>
        {!this.state.isOfflineMode && this.renderElectrumSettings()}
      </SettingsScreen>
    );
  }
}

ElectrumSettings.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func,
    goBack: PropTypes.func,
  }),
  route: PropTypes.shape({
    name: PropTypes.string,
    params: PropTypes.shape({
      server: PropTypes.string,
    }),
  }),
};

ElectrumSettings.navigationOptions = settingsNavigation(() => loc.settings.electrum_settings_server);

const SWITCH_TRACK = { false: settingsColors.border, true: settingsColors.orange };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  dotOn: { backgroundColor: settingsColors.good },
  dotOff: { backgroundColor: settingsColors.orange },
  statusText: { color: settingsColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 20 },
  hostname: {
    color: settingsColors.muted,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 14,
    marginTop: 8,
  },
  statusNote: { color: settingsColors.faint, fontSize: 13, lineHeight: 19, marginTop: 10 },
  form: { paddingBottom: 6 },
  formNote: { color: settingsColors.faint, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  portWrap: { flexDirection: 'row', alignItems: 'flex-end' },
  ssl: { alignItems: 'center', marginLeft: 16, marginBottom: 12 },
  usePort: { color: settingsColors.faint, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2, marginBottom: 6 },
  actions: { marginTop: 12, minHeight: 56, justifyContent: 'center' },
});
