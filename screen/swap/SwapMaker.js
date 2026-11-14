import { marsAlert } from '../../components/MarsDialog';
import React, { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { runMaker, saveMakerConfig, useMaker } from '../../blue_modules/swap';
import { describeMakerSwap, formatCoins, formatMars, formatSats, marketPriceText, parseCoins } from '../../blue_modules/swap/present';
import { CivicButton, civicColors } from '../../components/CivicUi';
import { SectionHeading, SmallAction, WorkspaceField, WorkspaceNotice, WorkspaceScreen, styles } from '../workspace/WorkspaceUi';
import { Row, Steps, swapStyles, useSwapWallet } from './SwapUi';

const COIN = 100000000;
// Plain digits for editing: no grouping.
const coins = value => formatCoins(value).replace(/,/g, '');

// The settings as the text the user edits.
const toForm = config => ({
  feePercent: String(config.feePercent),
  dailyLimit: coins(config.dailyLimit),
  maxSwap: coins(config.maxSwap),
  minSwap: coins(config.minSwap),
  reservePercent: String(config.reservePercent),
  offers: String(config.offers),
  floorSatsPerMars: config.floorSatsPerMars ? String(config.floorSatsPerMars) : '',
});

// The edited text as settings, or a message naming what to correct.
export function readMakerForm(form) {
  const number = text => (/^\s*\d+(?:[.,]\d+)?\s*$/.test(text) ? Number(String(text).replace(',', '.')) : NaN);
  const feePercent = number(form.feePercent);
  const reservePercent = number(form.reservePercent);
  const offers = number(form.offers);
  const dailyLimit = parseCoins(form.dailyLimit);
  const maxSwap = parseCoins(form.maxSwap);
  const minSwap = parseCoins(form.minSwap);
  const floorSatsPerMars = form.floorSatsPerMars.trim() ? number(form.floorSatsPerMars) : 0;
  if (!(feePercent >= 0 && feePercent <= 50)) return { problem: 'Set a spread between 0 and 50 percent.' };
  if (!(reservePercent >= 0 && reservePercent <= 95)) return { problem: 'Set a reserve between 0 and 95 percent.' };
  if (!Number.isInteger(offers) || offers < 1 || offers > 5) return { problem: 'Choose between 1 and 5 offers.' };
  if (minSwap === null || minSwap < COIN) return { problem: 'The smallest sale must be at least 1 MARS.' };
  if (maxSwap === null || maxSwap < minSwap) return { problem: 'The largest sale cannot be below the smallest.' };
  if (dailyLimit === null || dailyLimit < minSwap) return { problem: 'The daily limit cannot be below the smallest sale.' };
  if (!(floorSatsPerMars >= 0)) return { problem: 'The lowest price must be a number of sats, or empty.' };
  return { config: { feePercent, reservePercent, offers, dailyLimit, maxSwap, minSwap, floorSatsPerMars } };
}

// Offer Marscoin for Bitcoin: the automatic maker's switch, limits and sales.
export default function SwapMaker() {
  const wallet = useSwapWallet();
  const { config, status, records } = useMaker(wallet);
  const [form, setForm] = useState(() => toForm(config));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Follow the stored settings until the user starts editing.
  useEffect(() => {
    if (!dirty) setForm(toForm(config));
  }, [config, dirty]);

  useFocusEffect(
    useCallback(() => {
      runMaker(wallet);
    }, [wallet]),
  );

  const edit = key => text => {
    setDirty(true);
    setForm(current => ({ ...current, [key]: text }));
  };

  const apply = async enabled => {
    const read = readMakerForm(form);
    if (read.problem) return marsAlert('Check your settings', read.problem);
    setBusy(true);
    try {
      await saveMakerConfig(wallet, { ...read.config, enabled });
      setDirty(false);
    } catch (error) {
      marsAlert('Not saved', error?.message || 'Your settings could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = enabled => {
    if (!enabled) return apply(false);
    marsAlert(
      'Start offering Marscoin?',
      '1. The app posts offers at your spread over the market price and renews them every few minutes.\n\n' +
        '2. When a buyer accepts, the app locks that Marscoin for them. It returns to you after about sixteen hours if they do not pay.\n\n' +
        '3. When their Bitcoin is confirmed, the app collects it into your Bitcoin wallet here.\n\n' +
        'Offers are live only while this app is open. Keep it open after a buyer accepts, until the Bitcoin is collected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start offering', onPress: () => apply(true) },
      ],
    );
  };

  if (!wallet) {
    return (
      <WorkspaceScreen title="Offer Marscoin" eyebrow="MARTIAN REPUBLIC / SWAPS">
        <Text style={styles.secondaryText}>Create or restore a Marscoin wallet first.</Text>
      </WorkspaceScreen>
    );
  }

  const live = records.filter(record => record.state === 'offered');
  const underway = records.filter(record => ['accepted', 'locking', 'mars_locked', 'claiming', 'refunding'].includes(record.state));
  const settled = records.filter(record => ['completed', 'refunded', 'lost', 'declined'].includes(record.state));
  const sold = settled.filter(record => record.state === 'completed');
  const earned = sold.reduce((sum, record) => sum + record.btcAmount, 0);
  const position = status.position;

  return (
    <WorkspaceScreen title="Offer Marscoin" eyebrow="MARTIAN REPUBLIC / SWAPS">
      <Text style={styles.secondaryText}>
        Sell Marscoin for Bitcoin, person to person. The app keeps offers on the market at your price and completes each sale for you.
      </Text>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.caption}>AUTOMATIC OFFERS</Text>
            <Text style={styles.cardTitle}>{config.enabled ? 'On' : 'Off'}</Text>
          </View>
          <Switch
            accessibilityLabel="Automatic offers"
            value={config.enabled}
            disabled={busy}
            onValueChange={toggle}
            trackColor={{ false: civicColors.border, true: civicColors.orange }}
            thumbColor={civicColors.text}
            ios_backgroundColor={civicColors.border}
            testID="MakerSwitch"
          />
        </View>
        <Text style={styles.caption}>
          {config.enabled
            ? 'Offers are live while this app is open. They are withdrawn when you leave it.'
            : 'Nothing is on offer. Switch on to start.'}
        </Text>
      </View>

      {config.enabled && status.message ? <WorkspaceNotice>{status.message}</WorkspaceNotice> : null}

      {config.enabled ? (
        <View style={styles.card}>
          <Text style={styles.caption}>RIGHT NOW</Text>
          <Row label="Market price" value={marketPriceText(status)} />
          <Row
            label="Your base price"
            value={status.market ? `${(status.market * COIN * (1 + config.feePercent / 100)).toFixed(1)} sats per MARS` : '—'}
          />
          <Row label="On offer" value={formatMars(live.reduce((sum, record) => sum + record.marsAmount, 0))} strong />
          {position ? (
            <Row label="Sold in the last 24 hours" value={`${formatMars(position.soldToday)} of ${formatMars(config.dailyLimit)}`} />
          ) : null}
        </View>
      ) : null}

      {underway.length ? <SectionHeading title="Sales in progress" /> : null}
      {underway.map(record => {
        const view = describeMakerSwap(record);
        return (
          <View key={record.id} style={styles.card}>
            <Text style={styles.cardTitle}>{view.title}</Text>
            <Text style={styles.secondaryText}>{view.body}</Text>
            <Steps steps={view.steps} current={view.step} tone={view.tone} />
            <Text style={styles.caption}>
              {formatMars(record.marsAmount)} for {formatSats(record.btcAmount)}. Keep the app open until this completes.
            </Text>
          </View>
        );
      })}

      {live.length ? <SectionHeading title="Your offers" /> : null}
      {live.map(record => (
        <View key={record.id} style={[styles.card, swapStyles.offer]}>
          <View style={swapStyles.offerHead}>
            <Text style={swapStyles.offerMars}>{formatMars(record.marsAmount)}</Text>
            <Text style={swapStyles.offerPrice}>{formatSats(record.btcAmount)}</Text>
          </View>
          <Row label="Price per MARS" value={`${((record.btcAmount / record.marsAmount) * COIN).toFixed(1)} sats`} />
        </View>
      ))}

      <SectionHeading title="Your terms" />
      <WorkspaceField
        label="Spread over the market price (%)"
        value={form.feePercent}
        onChangeText={edit('feePercent')}
        keyboardType="decimal-pad"
        hint="Your smallest offer is priced this much above the market. Larger offers add up to 4 points more."
      />
      <WorkspaceField
        label="Most to sell in 24 hours (MARS)"
        value={form.dailyLimit}
        onChangeText={edit('dailyLimit')}
        keyboardType="decimal-pad"
      />
      <WorkspaceField label="Largest single sale (MARS)" value={form.maxSwap} onChangeText={edit('maxSwap')} keyboardType="decimal-pad" />
      <WorkspaceField label="Smallest single sale (MARS)" value={form.minSwap} onChangeText={edit('minSwap')} keyboardType="decimal-pad" />
      <WorkspaceField
        label="Keep back (% of balance)"
        value={form.reservePercent}
        onChangeText={edit('reservePercent')}
        keyboardType="decimal-pad"
        hint="This share of your Marscoin is never put on offer."
      />
      <WorkspaceField label="Offers at a time (1 to 5)" value={form.offers} onChangeText={edit('offers')} keyboardType="number-pad" />
      <WorkspaceField
        label="Never sell below (sats per MARS)"
        value={form.floorSatsPerMars}
        onChangeText={edit('floorSatsPerMars')}
        keyboardType="decimal-pad"
        hint="A hard limit that protects you if the price feed is wrong. Left empty, it is set to four fifths of the market price when you switch on."
      />
      {dirty ? (
        <CivicButton title={busy ? 'Saving…' : 'Save terms'} disabled={busy} onPress={() => apply(config.enabled)} testID="MakerSave" />
      ) : null}

      {settled.length ? <SectionHeading title="Earlier sales" /> : null}
      {sold.length ? (
        <Text style={styles.secondaryText}>
          {sold.length} completed, {formatSats(earned)} received.
        </Text>
      ) : null}
      {settled.slice(0, 20).map(record => {
        const view = describeMakerSwap(record);
        return (
          <View key={record.id} style={styles.card}>
            <Text style={styles.cardTitle}>{view.title}</Text>
            <Text style={styles.secondaryText}>{view.body}</Text>
            <Text style={styles.caption}>{new Date(record.createdAt * 1000).toLocaleDateString()}</Text>
          </View>
        );
      })}

      <SmallAction
        title="What can go wrong"
        icon="info"
        onPress={() =>
          marsAlert(
            'What to know before selling',
            '1. A buyer who accepts and never pays ties up that Marscoin for about sixteen hours. The relay limits how often one person can do this.\n\n' +
              '2. The app collects Bitcoin only after two confirmations, and never in the last half hour before the buyer could take it back.\n\n' +
              '3. If you close the app after a buyer accepts, the sale unwinds: they get their Bitcoin back and you get your Marscoin back, each after its time lock.\n\n' +
              'Your price comes from public price feeds. Set a lowest price if you want a hard limit.',
          )
        }
      />
    </WorkspaceScreen>
  );
}
