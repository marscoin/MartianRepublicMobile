import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { networkNodes, probeNode, STRIP_NODES, stripReadings } from '../blue_modules/network-status';
import { civicColors } from './CivicUi';
import MarsFrame from './MarsFrame';

// A row of real readings at the top of the home screen, the way a ship's console shows its systems: how far the
// Marscoin chain has come, whether the Republic answers, and how many of the Marscoin servers do. The same checks as
// the live network view, fewer of them, once a minute while the screen is open. Tapping it opens that view.

let realNodes;
// Built on first use, so that loading this file does not start the swap and wallet connections.
function defaultNodes() {
  if (!realNodes) {
    const { swapChain } = require('../blue_modules/swap');
    const MARSConnection = require('../blue_modules/MARSConnection');
    realNodes = networkNodes({
      fetch: (...args) => fetch(...args),
      relayTip: () => swapChain.tipHeight(),
      // Right after the app opens it is still connecting: wait for that (within the check's own time limit)
      // rather than count a server that is on its way as one that does not answer.
      walletServer: async () => {
        await MARSConnection.waitTillConnected();
        return MARSConnection.getConfig();
      },
    }).filter(node => STRIP_NODES.includes(node.id));
  }
  return realNodes;
}

const TONE = { ok: civicColors.ok, warn: civicColors.warn, idle: civicColors.muted };
const SAY = {
  chain: reading =>
    reading.tone === 'ok'
      ? `Marscoin block ${reading.text}`
      : reading.tone === 'warn'
        ? 'Marscoin chain not answering'
        : 'checking the chain',
  republic: reading =>
    reading.tone === 'ok'
      ? 'the Republic is answering'
      : reading.tone === 'warn'
        ? 'the Republic is not answering'
        : 'checking the Republic',
  servers: reading =>
    reading.tone === 'idle' ? 'checking the Marscoin servers' : `${reading.text.replace('/', ' of ')} Marscoin servers answering`,
};

export default function StatusStrip({ nodes, refreshSeconds = 60 }) {
  const navigation = useNavigation();
  const [results, setResults] = useState({});
  const alive = useRef(true);
  const check = useCallback(() => {
    for (const node of nodes || defaultNodes()) {
      probeNode(node).then(result => {
        // A new answer replaces the last one only when it arrives, so the readings never blink back to "…".
        if (alive.current) setResults(current => ({ ...current, [node.id]: result }));
      });
    }
  }, [nodes]);
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      check();
      const timer = setInterval(check, refreshSeconds * 1000);
      return () => {
        alive.current = false;
        clearInterval(timer);
      };
    }, [check, refreshSeconds]),
  );
  const readings = stripReadings(Object.values(results));
  const label = `Network: ${SAY.chain(readings.chain)}, ${SAY.republic(readings.republic)}, ${SAY.servers(readings.servers)}. Opens the live network view.`;
  return (
    <MarsFrame
      onPress={() => navigation.navigate('NetworkLive')}
      accessibilityRole="button"
      accessibilityLabel={label}
      cut={10}
      style={styles.strip}
      testID="StatusStrip"
    >
      <Reading name="CHAIN" reading={readings.chain} dot testID="StatusStrip-chain" />
      <View style={styles.sep} />
      <Reading name="REPUBLIC" reading={readings.republic} dot testID="StatusStrip-republic" />
      <View style={styles.sep} />
      <Reading name="SERVERS" reading={readings.servers} testID="StatusStrip-servers" />
    </MarsFrame>
  );
}

function Reading({ name, reading, dot = false, testID }) {
  const color = TONE[reading.tone];
  return (
    <View style={styles.reading} testID={testID}>
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <Text numberOfLines={1} style={[styles.value, { color: reading.tone === 'ok' ? civicColors.text : color }]}>
        {reading.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  reading: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  name: { fontFamily: 'ChakraPetch-Medium', fontSize: 10, letterSpacing: 1, color: civicColors.muted, marginRight: 6 },
  value: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 0.6, fontVariant: ['tabular-nums'] },
  sep: { width: 1, height: 12, backgroundColor: civicColors.border, marginHorizontal: 8 },
});
