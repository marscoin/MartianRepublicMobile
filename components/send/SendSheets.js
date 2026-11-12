// The two sheets that rise from the bottom of the send screen: the network
// fee (one standard fee, and a custom rate for those who want one) and the
// list of further options.
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomModal from '../BottomModal';
import { feeRateText, networkFeeText, NEXT_BLOCK_TEXT } from '../../blue_modules/mars-fee-text';
import { CardLabel, SendButton, SendOverline, TimingLine, sendColors } from './SendUi';
import { customFeeRate } from './sendFormat';

function Sheet({ visible, onClose, overline, title, children, avoidKeyboard = false, testID }) {
  const insets = useSafeAreaInsets();
  return (
    <BottomModal isVisible={visible} onClose={onClose} avoidKeyboard={avoidKeyboard}>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID={testID}>
        <View style={styles.grip} />
        <SendOverline>{overline}</SendOverline>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {children}
      </View>
    </BottomModal>
  );
}

// `rate` is the rate in use, `standardRate` the one the wallet picks by
// itself, `custom` whether the person has set their own. `onChoose(null)`
// goes back to the standard rate; `onChoose('3')` sets a custom one.
export function FeeSheet({ visible, onClose, fee, rate, standardRate, custom = false, usdRate, onChoose }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setOpen(custom);
    setText(custom ? String(rate) : '');
    setError('');
  }, [visible, custom, rate]);

  const apply = () => {
    const result = customFeeRate(text);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChoose(result.rate);
  };

  const amount = networkFeeText(fee, usdRate);

  return (
    <Sheet visible={visible} onClose={onClose} overline="MCR / FEE" title="Network fee" avoidKeyboard testID="FeeSheet">
      <Text style={styles.body}>
        Marscoin blocks have plenty of room. Every payment that pays at least the minimum of 1 zubrin per byte goes into the next block, so
        paying more does not make it faster.
      </Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: !custom }}
        activeOpacity={0.85}
        onPress={() => onChoose(null)}
        style={[styles.choice, !custom && styles.choiceOn]}
        testID="feeStandard"
      >
        <View style={[styles.radio, !custom && styles.radioOn]}>{!custom ? <View style={styles.radioDot} /> : null}</View>
        <View style={styles.choiceText}>
          <Text style={styles.choiceTitle}>Standard</Text>
          <Text style={styles.choiceNote}>
            {feeRateText(standardRate)}
            {!custom && amount ? ` · ${amount}` : ''}
          </Text>
        </View>
      </TouchableOpacity>

      <CardLabel style={styles.advanced}>ADVANCED</CardLabel>
      {open ? (
        <View style={[styles.choice, styles.choiceColumn, custom && styles.choiceOn]}>
          <Text style={styles.choiceTitle}>Custom rate</Text>
          <View style={styles.rateRow}>
            <TextInput
              accessibilityLabel="Custom fee rate in zubrins per byte"
              testID="feeCustomInput"
              value={text}
              onChangeText={value => {
                setText(value);
                setError('');
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={apply}
              placeholder="1"
              placeholderTextColor={sendColors.dim}
              selectionColor={sendColors.orange}
              maxLength={7}
              style={styles.rateInput}
            />
            <Text style={styles.rateUnit}>zubrins/byte</Text>
          </View>
          {error ? (
            <Text style={styles.error} testID="feeCustomError">
              {error}
            </Text>
          ) : (
            <Text style={styles.choiceNote}>
              {custom && amount ? `Now ${feeRateText(rate)} · ${amount}. ` : ''}
              The minimum is 1. The fee for this payment is shown before you send.
            </Text>
          )}
          <SendButton title="Use this rate" onPress={apply} testID="feeCustomApply" style={styles.apply} />
        </View>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => setOpen(true)}
          style={styles.choice}
          testID="feeCustom"
        >
          <Icon name="sliders" type="feather" size={18} color={sendColors.orange} />
          <View style={styles.choiceText}>
            <Text style={styles.choiceTitle}>Custom rate</Text>
            <Text style={styles.choiceNote}>Set your own rate in zubrins per byte.</Text>
          </View>
          <Icon name="chevron-right" type="feather" size={18} color={sendColors.dim} />
        </TouchableOpacity>
      )}

      <TimingLine style={styles.timing}>{NEXT_BLOCK_TEXT}</TimingLine>
    </Sheet>
  );
}

// `options`: { key, title, icon, onPress, disabled, testID } for a row that
// does something, plus { switchValue, onSwitch } for one that is a setting.
export function OptionsSheet({ visible, onClose, options = [] }) {
  return (
    <Sheet visible={visible} onClose={onClose} overline="MCR / SEND" title="More options" testID="SendOptionsSheet">
      <ScrollView style={styles.options} bounces={false} showsVerticalScrollIndicator={false}>
        {options.map((option, index) => {
          const isSwitch = typeof option.onSwitch === 'function';
          const body = (
            <>
              <View style={styles.optionIcon}>
                <Icon name={option.icon || 'circle'} type="feather" size={18} color={sendColors.orange} />
              </View>
              <Text style={[styles.optionTitle, option.disabled && styles.dim]}>{option.title}</Text>
              {isSwitch ? (
                <Switch
                  value={!!option.switchValue}
                  onValueChange={option.onSwitch}
                  trackColor={{ false: sendColors.border, true: sendColors.orange }}
                  thumbColor={sendColors.text}
                  ios_backgroundColor={sendColors.border}
                  accessibilityLabel={option.title}
                />
              ) : (
                <Icon name="chevron-right" type="feather" size={18} color={sendColors.dim} />
              )}
            </>
          );
          const rowStyle = [styles.option, index === options.length - 1 && styles.optionLast];
          return isSwitch ? (
            <View key={option.key} style={rowStyle} testID={option.testID}>
              {body}
            </View>
          ) : (
            <TouchableOpacity
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!option.disabled }}
              disabled={!!option.disabled}
              onPress={option.onPress}
              activeOpacity={0.8}
              style={rowStyle}
              testID={option.testID}
            >
              {body}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#101317',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: sendColors.border,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: sendColors.border, marginBottom: 18 },
  title: { color: sendColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 24, lineHeight: 30, marginTop: 6, marginBottom: 10 },
  body: { color: sendColors.muted, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: sendColors.hairline,
    backgroundColor: sendColors.panel,
  },
  choiceColumn: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  choiceOn: { borderColor: sendColors.orange },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  choiceNote: { color: sendColors.faint, fontSize: 13, lineHeight: 18 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: sendColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: sendColors.orange },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: sendColors.orange },
  advanced: { marginTop: 18, marginBottom: 8 },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: sendColors.border,
    backgroundColor: sendColors.background,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  rateInput: {
    flex: 1,
    color: sendColors.text,
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 22,
    paddingVertical: 8,
    fontVariant: ['tabular-nums'],
  },
  rateUnit: { color: sendColors.faint, fontFamily: 'ChakraPetch-Medium', fontSize: 14 },
  error: { color: sendColors.danger, fontSize: 13, lineHeight: 18 },
  apply: { minHeight: 48, marginTop: 4 },
  timing: { marginTop: 16, marginBottom: 4 },
  options: { maxHeight: 420, marginTop: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sendColors.border,
  },
  optionLast: { borderBottomWidth: 0 },
  optionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: sendColors.tile, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { flex: 1, color: sendColors.text, fontFamily: 'ChakraPetch-Medium', fontSize: 16 },
  dim: { opacity: 0.4 },
});
