import { marsAlert } from '../../components/MarsDialog';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { Icon } from 'react-native-elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
//import { useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { decodeUR, extractSingleWorkload, BlueURDecoder } from '../../blue_modules/ur';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import loc from '../../loc';
import presentAlert from '../../components/Alert';
import { openPrivacyDesktopSettings } from '../../class/camera';
import { isCameraAuthorizationStatusGranted } from '../../helpers/scan-qr';
import { CivicButton, civicColors } from '../../components/CivicUi';
import BlueClipboard from '../../blue_modules/clipboard';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';

const LocalQRCode = require('@remobile/react-native-qrcode-local-image');
const createHash = require('create-hash');
const fs = require('../../blue_modules/fs');
const Base43 = require('../../blue_modules/base43');
const bitcoin = require('bitcoinjs-lib');
let decoder = false;

const DIM = 'rgba(8,10,12,0.72)';
const BRACKET = 30;
const BRACKET_WIDTH = 3;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: civicColors.background,
  },
  fill: { ...StyleSheet.absoluteFillObject },
  // The overlay is three bands. The middle one holds the clear window, so the
  // dimmed surround always lines up with the brackets.
  band: { flex: 1, backgroundColor: DIM, paddingHorizontal: 20 },
  bandSolid: { backgroundColor: civicColors.background },
  // Without the camera the top and bottom take only the room they need.
  bandFit: { flex: 0, paddingBottom: 12 },
  bandBottom: { justifyContent: 'flex-end' },
  middle: { flexDirection: 'row' },
  side: { flex: 1, backgroundColor: DIM },
  overlineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tick: { width: 3, height: 13, backgroundColor: civicColors.orange, marginRight: 9 },
  overline: { color: civicColors.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2 },
  title: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 26, marginBottom: 6 },
  guidance: { color: civicColors.muted, fontSize: 15, lineHeight: 21 },
  bracket: { position: 'absolute', width: BRACKET, height: BRACKET, borderColor: civicColors.orange },
  bracketTopLeft: { top: 0, left: 0, borderTopWidth: BRACKET_WIDTH, borderLeftWidth: BRACKET_WIDTH, borderTopLeftRadius: 10 },
  bracketTopRight: { top: 0, right: 0, borderTopWidth: BRACKET_WIDTH, borderRightWidth: BRACKET_WIDTH, borderTopRightRadius: 10 },
  bracketBottomLeft: { bottom: 0, left: 0, borderBottomWidth: BRACKET_WIDTH, borderLeftWidth: BRACKET_WIDTH, borderBottomLeftRadius: 10 },
  bracketBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: BRACKET_WIDTH,
    borderRightWidth: BRACKET_WIDTH,
    borderBottomRightRadius: 10,
  },
  scanLine: { position: 'absolute', left: 14, right: 14, top: 0, height: 2, borderRadius: 1, backgroundColor: civicColors.orange },
  readFlash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: civicColors.orange,
    backgroundColor: 'rgba(255,129,45,0.22)',
  },
  readMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: civicColors.orange,
  },
  progress: {
    backgroundColor: civicColors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: civicColors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressTitle: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 17 },
  progressNote: { color: '#8A9098', fontSize: 13, flexShrink: 1, marginLeft: 12, textAlign: 'right' },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: civicColors.border, marginTop: 10, overflow: 'hidden' },
  progressBar: { height: 3, borderRadius: 2, backgroundColor: civicColors.orange },
  notice: { color: civicColors.text, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 12 },
  controls: { flexDirection: 'row', gap: 8 },
  control: {
    flex: 1,
    minHeight: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: civicColors.border,
    backgroundColor: 'rgba(20,23,27,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  controlOn: { borderColor: civicColors.orange, backgroundColor: civicColors.orange },
  controlText: { color: civicColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 12, letterSpacing: 0.5, marginTop: 4 },
  controlTextOn: { color: civicColors.background },
  denied: { flex: 1, justifyContent: 'center' },
  deniedCard: {
    backgroundColor: civicColors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: civicColors.border,
    padding: 20,
  },
  deniedIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1D2126',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  deniedTitle: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 20, marginBottom: 8 },
  deniedBody: { color: civicColors.muted, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: civicColors.background },
  backdoorButton: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.01)',
    position: 'absolute',
  },
  backdoorInputWrapper: {
    position: 'absolute',
    left: '5%',
    top: '8%',
    width: '90%',
    backgroundColor: civicColors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: civicColors.border,
    padding: 16,
  },
  backdoorLabel: { color: civicColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 15, marginBottom: 10 },
  backdoorInput: {
    height: 160,
    marginBottom: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: civicColors.border,
    backgroundColor: civicColors.background,
    color: civicColors.text,
    textAlignVertical: 'top',
  },
});

// One labelled control in the row at the bottom of the scanner.
function ScanControl({ icon, label, accessibilityLabel, onPress, testID, on = false }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected: on }}
      activeOpacity={0.8}
      style={[styles.control, on && styles.controlOn]}
      onPress={onPress}
      testID={testID}
    >
      <Icon name={icon} type="feather" size={20} color={on ? civicColors.background : civicColors.orange} />
      <Text style={[styles.controlText, on && styles.controlTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// The clear window: four orange corner brackets, a line that sweeps while the
// camera is looking, and a mark that flashes when a code is read.
function Reticle({ size, sweep, flash, moving }) {
  return (
    <View style={{ width: size, height: size }} testID="ScanQrReticle" pointerEvents="none">
      {moving ? (
        <Animated.View
          style={[
            styles.scanLine,
            {
              opacity: sweep.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.9, 0.9, 0] }),
              transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [12, size - 14] }) }],
            },
          ]}
        />
      ) : null}
      <Animated.View style={[styles.readFlash, { opacity: flash }]}>
        <View style={styles.readMark}>
          <Icon name="check" type="feather" size={30} color={civicColors.background} />
        </View>
      </Animated.View>
      <View style={[styles.bracket, styles.bracketTopLeft]} />
      <View style={[styles.bracket, styles.bracketTopRight]} />
      <View style={[styles.bracket, styles.bracketBottomLeft]} />
      <View style={[styles.bracket, styles.bracketBottomRight]} />
    </View>
  );
}

const ScanQRCode = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { launchedBy, onBarScanned, onDismiss, showFileImportButton } = route.params;
  const scannedCache = {};
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [backdoorPressed, setBackdoorPressed] = useState(0);
  const [urTotal, setUrTotal] = useState(0);
  const [urHave, setUrHave] = useState(0);
  // Newer multi-part codes report how much has been read, not a part count.
  const [urIsPercent, setUrIsPercent] = useState(false);
  const [backdoorText, setBackdoorText] = useState('');
  const [backdoorVisible, setBackdoorVisible] = useState(false);
  const [animatedQRCodeData, setAnimatedQRCodeData] = useState({});
  // null until the system has answered, so the "camera is off" state is not
  // flashed at people who have already allowed it.
  const [cameraStatusGranted, setCameraStatusGranted] = useState(null);
  const [torch, setTorch] = useState(false);
  const [notice, setNotice] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const sweep = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const noticeTimer = useRef(null);

  useEffect(() => {
    let mounted = true;
    const check = () =>
      isCameraAuthorizationStatusGranted()
        .then(granted => mounted && setCameraStatusGranted(granted))
        .catch(() => mounted && setCameraStatusGranted(false));
    check();
    // Coming back from Settings: look again, the answer may have changed.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => mounted && setReduceMotion(Boolean(enabled)))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => setReduceMotion(Boolean(enabled)));
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  const scanning = cameraStatusGranted === true && isFocused && !isLoading;
  useEffect(() => {
    if (!scanning || reduceMotion) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanning, reduceMotion, sweep]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const say = useCallback(message => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 4000);
  }, []);

  // A light tap and a mark in the frame when something is read. Neither waits:
  // the result is handed on in the same breath. Animated values are used so
  // that no extra render happens between reading and handing on.
  const confirmRead = () => {
    try {
      triggerHapticFeedback(HapticFeedbackTypes.ImpactLight);
    } catch (_) {}
    flash.stopAnimation();
    if (reduceMotion) {
      flash.setValue(1);
      return;
    }
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 500, delay: 250, useNativeDriver: true }),
    ]).start();
  };

  const HashIt = function (s) {
    return createHash('sha256').update(s).digest().toString('hex');
  };

  const _onReadUniformResourceV2 = part => {
    if (!decoder) decoder = new BlueURDecoder();
    try {
      decoder.receivePart(part);
      if (decoder.isComplete()) {
        const data = decoder.toString();
        decoder = false; // nullify for future use (?)
        confirmRead();
        if (launchedBy) {
          navigation.navigate({ name: launchedBy, params: {}, merge: true });
        }
        onBarScanned({ data });
      } else {
        setUrIsPercent(true);
        setUrTotal(100);
        setUrHave(Math.floor(decoder.estimatedPercentComplete() * 100));
      }
    } catch (error) {
      console.warn(error);
      setIsLoading(true);
      marsAlert(
        loc.send.scan_error,
        loc._.invalid_animated_qr_code_fragment,
        [
          {
            text: loc._.ok,
            onPress: () => {
              setIsLoading(false);
            },
            style: 'default',
          },
        ],
        { cancelabe: false },
      );
    }
  };

  /**
   *
   * @deprecated remove when we get rid of URv1 support
   */
  const _onReadUniformResource = ur => {
    try {
      const [index, total] = extractSingleWorkload(ur);
      animatedQRCodeData[index + 'of' + total] = ur;
      setUrIsPercent(false);
      setUrTotal(total);
      setUrHave(Object.values(animatedQRCodeData).length);
      if (Object.values(animatedQRCodeData).length === total) {
        const payload = decodeUR(Object.values(animatedQRCodeData));
        // lets look inside that data
        let data = false;
        if (Buffer.from(payload, 'hex').toString().startsWith('psbt')) {
          // its a psbt, and whoever requested it expects it encoded in base64
          data = Buffer.from(payload, 'hex').toString('base64');
        } else {
          // its something else. probably plain text is expected
          data = Buffer.from(payload, 'hex').toString();
        }
        confirmRead();
        if (launchedBy) {
          navigation.navigate({ name: launchedBy, params: {}, merge: true });
        }
        onBarScanned({ data });
      } else {
        setAnimatedQRCodeData(animatedQRCodeData);
      }
    } catch (error) {
      console.warn(error);
      setIsLoading(true);
      marsAlert(
        loc.send.scan_error,
        loc._.invalid_animated_qr_code_fragment,
        [
          {
            text: loc._.ok,
            onPress: () => {
              setIsLoading(false);
            },
            style: 'default',
          },
        ],
        { cancelabe: false },
      );
    }
  };

  const onBarCodeRead = ret => {
    const h = HashIt(ret.data);
    if (scannedCache[h]) {
      // this QR was already scanned by this ScanQRCode, lets prevent firing duplicate callbacks
      return;
    }
    scannedCache[h] = +new Date();

    if (ret.data.toUpperCase().startsWith('UR:CRYPTO-ACCOUNT')) {
      return _onReadUniformResourceV2(ret.data);
    }

    if (ret.data.toUpperCase().startsWith('UR:CRYPTO-PSBT')) {
      return _onReadUniformResourceV2(ret.data);
    }

    if (ret.data.toUpperCase().startsWith('UR:CRYPTO-OUTPUT')) {
      return _onReadUniformResourceV2(ret.data);
    }

    if (ret.data.toUpperCase().startsWith('UR:BYTES')) {
      const splitted = ret.data.split('/');
      if (splitted.length === 3 && splitted[1].includes('-')) {
        return _onReadUniformResourceV2(ret.data);
      }
    }

    if (ret.data.toUpperCase().startsWith('UR')) {
      return _onReadUniformResource(ret.data);
    }

    // is it base43? stupid electrum desktop
    try {
      const hex = Base43.decode(ret.data);
      bitcoin.Psbt.fromHex(hex); // if it doesnt throw - all good

      confirmRead();
      if (launchedBy) {
        navigation.navigate({ name: launchedBy, params: {}, merge: true });
      }
      onBarScanned({ data: Buffer.from(hex, 'hex').toString('base64') });
      return;
    } catch (_) {}

    if (!isLoading) {
      setIsLoading(true);
      try {
        confirmRead();
        if (launchedBy) {
          navigation.navigate({ name: launchedBy, params: {}, merge: true });
        }
        onBarScanned(ret.data);
      } catch (e) {
        console.log(e);
      }
    }
    setIsLoading(false);
  };

  const showFilePicker = async () => {
    setIsLoading(true);
    const { data } = await fs.showFilePickerAndReadFile();
    if (data) onBarCodeRead({ data });
    setIsLoading(false);
  };

  const showImagePicker = () => {
    if (!isLoading) {
      setIsLoading(true);
      launchImageLibrary(
        {
          title: null,
          mediaType: 'photo',
          takePhotoButtonTitle: null,
          maxHeight: 800,
          maxWidth: 600,
          selectionLimit: 1,
        },
        response => {
          if (response.didCancel) {
            setIsLoading(false);
          } else {
            const asset = response.assets[0];
            if (asset.uri) {
              const uri = asset.uri.toString().replace('file://', '');
              LocalQRCode.decode(uri, (error, result) => {
                if (!error) {
                  onBarCodeRead({ data: result });
                } else {
                  presentAlert({ message: loc.send.qr_error_no_qrcode });
                  setIsLoading(false);
                }
              });
            } else {
              setIsLoading(false);
            }
          }
        },
      );
    }
  };

  // The same text a QR code would have carried, taken from the clipboard.
  const pasteFromClipboard = async () => {
    if (isLoading) return;
    let pasted = '';
    try {
      pasted = String((await BlueClipboard().getClipboardContent()) || '').trim();
    } catch (_) {}
    if (!pasted) {
      say('Nothing to paste. Copy an address or a payment code first.');
      return;
    }
    onBarCodeRead({ data: pasted });
  };

  const dismiss = () => {
    if (launchedBy) {
      navigation.navigate({ name: launchedBy, params: {}, merge: true });
    } else {
      navigation.goBack();
    }
    if (onDismiss) onDismiss();
  };

  const reticleSize = Math.max(200, Math.min(300, Math.round(Math.min(width, height) * 0.68)));
  const cameraReady = cameraStatusGranted === true;
  const cameraDenied = cameraStatusGranted === false;
  const percent = urTotal > 0 ? Math.max(0, Math.min(100, Math.round((urHave / urTotal) * 100))) : 0;

  const header = (
    <View style={[styles.band, !cameraReady && styles.bandSolid, !cameraReady && styles.bandFit, { paddingTop: insets.top + 18 }]}>
      <View style={styles.overlineRow}>
        <View style={styles.tick} />
        <Text style={styles.overline}>MCR / SCAN</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Scan a code
      </Text>
      {cameraReady ? <Text style={styles.guidance}>Hold a Marscoin address or a payment code inside the frame.</Text> : null}
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      <ScanControl icon="x" label="Close" accessibilityLabel={loc._.close} onPress={dismiss} testID="ScanQrClose" />
      <ScanControl icon="image" label="Photo" accessibilityLabel={loc._.pick_image} onPress={showImagePicker} testID="ScanQrPickImage" />
      <ScanControl
        icon="clipboard"
        label="Paste"
        accessibilityLabel="Paste a code from the clipboard"
        onPress={pasteFromClipboard}
        testID="ScanQrPaste"
      />
      {cameraReady ? (
        <ScanControl
          icon={torch ? 'zap' : 'zap-off'}
          label="Light"
          accessibilityLabel={torch ? 'Turn the light off' : 'Turn the light on'}
          onPress={() => setTorch(value => !value)}
          testID="ScanQrTorch"
          on={torch}
        />
      ) : null}
    </View>
  );

  const footer = (
    <View
      style={[
        styles.band,
        styles.bandBottom,
        !cameraReady && styles.bandSolid,
        !cameraReady && styles.bandFit,
        { paddingBottom: insets.bottom + 16 },
      ]}
    >
      {urTotal > 0 && (
        <View style={styles.progress} testID="UrProgressBar" accessible accessibilityRole="progressbar">
          <View style={styles.progressRow}>
            <Text style={styles.progressTitle}>{urIsPercent ? `${percent}% read` : `Part ${urHave} of ${urTotal}`}</Text>
            <Text style={styles.progressNote}>Keep the code in the frame.</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${percent}%` }]} testID="UrProgressFill" />
          </View>
        </View>
      )}
      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite" testID="ScanQrNotice">
          {notice}
        </Text>
      ) : null}
      {controls}
    </View>
  );

  const render = isLoading ? (
    <View style={styles.loading} testID="ScanQrLoading">
      <ActivityIndicator color={civicColors.orange} />
    </View>
  ) : (
    <>
      {cameraReady && isFocused ? (
        <Camera
          style={styles.fill}
          cameraType={CameraType.Back}
          scanBarcode
          showFrame={false}
          torchMode={torch ? 'on' : 'off'}
          onReadCode={event => onBarCodeRead({ data: event?.nativeEvent?.codeStringValue })}
        />
      ) : null}
      <View style={styles.fill} pointerEvents="box-none">
        {header}
        {cameraReady ? (
          <View style={styles.middle} pointerEvents="none">
            <View style={styles.side} />
            <Reticle size={reticleSize} sweep={sweep} flash={flash} moving={scanning && !reduceMotion} />
            <View style={styles.side} />
          </View>
        ) : cameraDenied ? (
          <View style={[styles.band, styles.bandSolid, styles.denied]} testID="ScanQrCameraDenied">
            <View style={styles.deniedCard}>
              <View style={styles.deniedIcon}>
                <Icon name="camera-off" type="feather" size={22} color={civicColors.orange} />
              </View>
              <Text style={styles.deniedTitle}>The camera is switched off</Text>
              <Text style={styles.deniedBody}>
                Martian Republic needs the camera to read codes. Allow it in Settings, or choose a photo of the code or paste its text
                instead.
              </Text>
              <CivicButton
                title={loc.send.open_settings}
                icon="settings"
                onPress={openPrivacyDesktopSettings}
                testID="ScanQrOpenSettings"
              />
            </View>
          </View>
        ) : (
          <View style={[styles.band, styles.bandSolid]} />
        )}
        {footer}
      </View>
      {backdoorVisible && (
        <View style={styles.backdoorInputWrapper}>
          <Text style={styles.backdoorLabel}>Provide QR code contents manually:</Text>
          <TextInput
            testID="scanQrBackdoorInput"
            multiline
            underlineColorAndroid="transparent"
            style={styles.backdoorInput}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            selectTextOnFocus={false}
            keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
            value={backdoorText}
            onChangeText={setBackdoorText}
          />
          <CivicButton
            title="OK"
            testID="scanQrBackdoorOkButton"
            onPress={() => {
              setBackdoorVisible(false);
              setBackdoorText('');

              if (backdoorText) onBarCodeRead({ data: backdoorText });
            }}
          />
        </View>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={loc._.qr_custom_input_button}
        testID="ScanQrBackdoorButton"
        style={styles.backdoorButton}
        onPress={async () => {
          // this is an invisible backdoor button on bottom left screen corner
          // tapping it 10 times fires prompt dialog asking for a string thats gona be passed to onBarCodeRead.
          // this allows to mock and test QR scanning in e2e tests
          setBackdoorPressed(backdoorPressed + 1);
          if (backdoorPressed < 5) return;
          setBackdoorPressed(0);
          setBackdoorVisible(true);
        }}
      />
    </>
  );

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar barStyle="light-content" /> : null}
      {render}
    </View>
  );
};

export default ScanQRCode;


// const importQrTransactionOnBarScanned =  (ret, wallet, transactionMemo)  => {
//   const navigation = useNavigation();
//   navigation.getParent().pop();
//   if (!ret.data) ret = { data: ret };
//   if (ret.data.toUpperCase().startsWith('UR')) {
//     presentAlert({ title: loc.errors.error, message: 'BC-UR not decoded. This should never happen' });
//   } else if (ret.data.indexOf('+') === -1 && ret.data.indexOf('=') === -1 && ret.data.indexOf('=') === -1) {
//     // this looks like NOT base64, so maybe its transaction's hex
//     // we dont support it in this flow
//   } else {
//     // psbt base64?

//     // we construct PSBT object and pass to next screen
//     // so user can do smth with it:
//     const psbt = bitcoin.Psbt.fromBase64(ret.data);
//     navigation.navigate('PsbtWithHardwareWallet', {
//       memo: transactionMemo,
//       fromWallet: wallet,
//       psbt,
//     });
//     setIsLoading(false);
//     setOptionsVisible(false);
//   }
// };

ScanQRCode.initialParams = {
  isLoading: false,
  cameraStatusGranted: undefined,
  backdoorPressed: undefined,
  launchedBy: undefined,
  urTotal: undefined,
  urHave: undefined,
  backdoorText: '',
  onDismiss: undefined,
  showFileImportButton: true,
  backdoorVisible: false,
  animatedQRCodeData: {},
  //onBarScanned: (data) => importQrTransactionOnBarScanned(data, navigation, wallet, transactionMemo)
};
