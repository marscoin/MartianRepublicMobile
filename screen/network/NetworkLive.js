import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Icon } from 'react-native-elements';
import { networkNodes, networkSummary, probeNode, pulseDuration, ringPositions } from '../../blue_modules/network-status';
import { swapChain } from '../../blue_modules/swap';
import { parseHeader } from '../../blue_modules/swap/mars-headers';
import { civicColors } from '../../components/CivicUi';
import { marsAlert } from '../../components/MarsDialog';
import { SectionHeading, WorkspaceScreen, styles } from '../workspace/WorkspaceUi';

const MARSConnection = require('../../blue_modules/MARSConnection');

const REFRESH_SECONDS = 20;
const CHAIN = {
  mars: { color: civicColors.orange, icon: 'hexagon', label: 'Marscoin' },
  btc: { color: '#E8C27A', icon: 'box', label: 'Bitcoin' },
  republic: { color: '#8FCEAB', icon: 'flag', label: 'Republic' },
};
const DOWN = '#E0705A';
const group = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const nodes = networkNodes({
  fetch: (...args) => fetch(...args),
  relayTip: () => swapChain.tipHeight(),
  walletServer: () => MARSConnection.getConfig(),
});

// A dot that runs along a link, out from the phone and back, at the speed the
// server answered with.
function Pulse({ from, to, duration, color, back = false }) {
  const travel = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    travel.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(back ? duration * 0.5 : 0),
        Animated.timing(travel, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(back ? 0 : duration * 0.5),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [travel, duration, back]);
  const [a, b] = back ? [to, from] : [from, to];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        map.pulse,
        { backgroundColor: color },
        {
          opacity: travel.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [a.x - 3, b.x - 3] }) },
            { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [a.y - 3, b.y - 3] }) },
          ],
        },
      ]}
    />
  );
}

// A slow ring spreading from the phone: it is asking.
function Beacon({ center }) {
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(beat, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [beat]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        map.beacon,
        { left: center.x - 34, top: center.y - 34 },
        {
          opacity: beat.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.4] }) }],
        },
      ]}
    />
  );
}

// The network, live: this phone in the middle and every service it talks to
// around it. Links pulse at the speed each service actually answered.
export default function NetworkLive() {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 420);
  const [results, setResults] = useState({});
  const [lastBlock, setLastBlock] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const alive = useRef(true);

  const check = useCallback(async () => {
    // Each answer is shown as it arrives.
    await Promise.all(
      nodes.map(async node => {
        const result = await probeNode(node);
        if (alive.current) setResults(current => ({ ...current, [node.id]: result }));
      }),
    );
    try {
      const height = await swapChain.tipHeight();
      const header = parseHeader(await swapChain.header(height));
      if (alive.current) setLastBlock({ height, time: header.time });
    } catch {
      /* The relay row already says it is not answering. */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      check();
      const timer = setInterval(check, REFRESH_SECONDS * 1000);
      const clock = setInterval(() => setTick(value => value + 1), 15000);
      return () => {
        alive.current = false;
        clearInterval(timer);
        clearInterval(clock);
      };
    }, [check]),
  );

  const layout = useMemo(() => {
    const ring = ringPositions(nodes.length);
    return { center: { x: size / 2, y: size / 2 }, points: ring.map(point => ({ x: point.x * size, y: point.y * size })) };
  }, [size]);

  const known = nodes.map(node => results[node.id]);
  const summary = networkSummary(known);
  const marsHeight = Math.max(0, ...known.map(result => result?.marsHeight || 0));
  const btcHeight = Math.max(0, ...known.map(result => result?.btcHeight || 0));
  const minutes = lastBlock ? Math.max(0, Math.round((Date.now() / 1000 - lastBlock.time) / 60)) : null;
  const toneColor = { good: '#8FCEAB', warn: civicColors.orange, bad: DOWN, idle: civicColors.muted }[summary.tone];

  const explain = node => {
    const result = results[node.id];
    const state = !result
      ? 'Checking…'
      : result.ok
        ? `Answered in ${result.ms} ms. ${result.detail || ''}`
        : `Not answering. ${result.error || ''}`;
    marsAlert(node.name, `${node.role}\n\n${result?.host || node.host || ''}\n\n${state}`.replace(/\n\n\n\n/g, '\n\n'));
  };

  return (
    <WorkspaceScreen
      title="The network, live"
      eyebrow="MARTIAN REPUBLIC / NETWORK"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await check();
        setRefreshing(false);
      }}
    >
      <Text style={styles.secondaryText}>
        Your phone talks to these services directly. None of them holds your coins or your keys, and the app checks them against one
        another.
      </Text>

      <View style={[map.canvas, { width: size, height: size }]} testID="NetworkMap">
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={layout.center.x}
            cy={layout.center.y}
            r={size * 0.38}
            stroke={civicColors.border}
            strokeWidth={1}
            strokeDasharray="2 7"
            fill="none"
          />
          {nodes.map((node, index) => {
            const result = results[node.id];
            const color = !result ? civicColors.border : result.ok ? CHAIN[node.chain].color : DOWN;
            return (
              <Line
                key={node.id}
                x1={layout.center.x}
                y1={layout.center.y}
                x2={layout.points[index].x}
                y2={layout.points[index].y}
                stroke={color}
                strokeOpacity={result?.ok ? 0.45 : 0.25}
                strokeWidth={1}
                strokeDasharray={result && !result.ok ? '3 5' : undefined}
              />
            );
          })}
        </Svg>

        <Beacon center={layout.center} />
        {nodes.map((node, index) => {
          const result = results[node.id];
          if (!result?.ok) return null;
          const duration = pulseDuration(result.ms);
          const color = CHAIN[node.chain].color;
          return (
            <React.Fragment key={node.id}>
              <Pulse from={layout.center} to={layout.points[index]} duration={duration} color={color} />
              <Pulse from={layout.center} to={layout.points[index]} duration={duration} color={color} back />
            </React.Fragment>
          );
        })}

        <View style={[map.phone, { left: layout.center.x - 26, top: layout.center.y - 26 }]}>
          <Icon name="smartphone" type="feather" size={24} color={civicColors.text} />
        </View>

        {nodes.map((node, index) => {
          const result = results[node.id];
          const chain = CHAIN[node.chain];
          const color = !result ? civicColors.border : result.ok ? chain.color : DOWN;
          const point = layout.points[index];
          return (
            <TouchableOpacity
              key={node.id}
              accessibilityRole="button"
              accessibilityLabel={`${node.name}: ${!result ? 'checking' : result.ok ? `answered in ${result.ms} milliseconds` : 'not answering'}`}
              onPress={() => explain(node)}
              style={[map.node, { left: point.x - 44, top: point.y - 22 }]}
              testID={`NetworkNode-${node.id}`}
            >
              <View style={[map.nodeMark, { borderColor: color }]}>
                <Icon name={result && !result.ok ? 'x' : chain.icon} type="feather" size={18} color={color} />
              </View>
              <Text style={map.nodeLabel} numberOfLines={1}>
                {node.short}
              </Text>
              <Text style={map.nodeMs} numberOfLines={1}>
                {result?.ok ? `${result.ms} ms` : !result ? '…' : 'down'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={map.legend}>
        {Object.values(CHAIN).map(chain => (
          <View key={chain.label} style={map.legendItem}>
            <View style={[map.legendDot, { backgroundColor: chain.color }]} />
            <Text style={styles.caption}>{chain.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={map.summary}>
          <View style={[map.summaryDot, { backgroundColor: toneColor }]} />
          <Text style={[styles.cardTitle, styles.flex]}>{summary.text}</Text>
        </View>
        <View style={map.chains}>
          <View style={styles.flex}>
            <Text style={styles.caption}>MARSCOIN BLOCK</Text>
            <Text style={map.height}>{marsHeight ? group(marsHeight) : '—'}</Text>
            <Text style={styles.caption}>{minutes === null ? ' ' : minutes < 1 ? 'mined just now' : `mined ${minutes} min ago`}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.caption}>BITCOIN BLOCK</Text>
            <Text style={map.height}>{btcHeight ? group(btcHeight) : '—'}</Text>
            <Text style={styles.caption}> </Text>
          </View>
        </View>
      </View>

      <SectionHeading title="Who your phone is talking to" />
      {nodes.map(node => {
        const result = results[node.id];
        const chain = CHAIN[node.chain];
        return (
          <TouchableOpacity key={node.id} accessibilityRole="button" style={styles.card} onPress={() => explain(node)}>
            <View style={map.row}>
              <View style={[map.rowDot, { backgroundColor: !result ? civicColors.border : result.ok ? chain.color : DOWN }]} />
              <Text style={[styles.cardTitle, styles.flex]}>{node.name}</Text>
              <Text style={map.ms}>{result?.ok ? `${result.ms} ms` : !result ? '' : 'down'}</Text>
            </View>
            <Text style={styles.secondaryText}>{result?.host || node.host || 'Connecting…'}</Text>
            <Text style={styles.caption}>{!result ? 'Checking…' : result.ok ? result.detail : result.error}</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.caption}>
        Checked every {REFRESH_SECONDS} seconds while this screen is open. Tap a service to see what it is for.
      </Text>
    </WorkspaceScreen>
  );
}

const map = StyleSheet.create({
  canvas: { alignSelf: 'center', marginVertical: 8 },
  pulse: { position: 'absolute', left: 0, top: 0, width: 6, height: 6, borderRadius: 3 },
  beacon: { position: 'absolute', width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: civicColors.orange },
  phone: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#14171B',
    borderWidth: 1.5,
    borderColor: civicColors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  node: { position: 'absolute', width: 88, alignItems: 'center' },
  nodeMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: '#14171B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLabel: { color: civicColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, marginTop: 3 },
  nodeMs: { color: civicColors.muted, fontSize: 10 },
  legend: { flexDirection: 'row', justifyContent: 'center', marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  summaryDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  chains: { flexDirection: 'row', marginTop: 6 },
  height: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 22, marginVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  ms: { color: civicColors.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 13 },
});
