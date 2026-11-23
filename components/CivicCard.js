import React, { useId, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { homePlace, mapLayout } from '../blue_modules/mars-places';
import { civicColors } from './CivicUi';
import MarsFrame, { cutOutline, FrameHead } from './MarsFrame';

// The civic ID card on the home screen: the citizen over the contour lines of their home on Mars, a real place from
// NASA's elevation data, chosen from their address (blue_modules/mars-places.js). A crosshair marks the spot.

const CARD = '#0B0D10';
const CUT = 16;
const CROSSHAIR = { stroke: civicColors.text, strokeOpacity: 0.28, strokeDasharray: '4 4' };

export default function CivicCard({ name, status, address, avatar, onAvatarError, onPress }) {
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState(null);
  const [tagWidth, setTagWidth] = useState(0);
  const place = homePlace(address);
  const layout = size && place ? mapLayout(size.width, size.height) : null;
  // The place's name sits to the right of the crosshair, or to its left where the card is too narrow for it.
  const tagLeft = layout && (layout.spotX + 14 + tagWidth <= size.width - 10 ? layout.spotX + 14 : layout.spotX - 14 - tagWidth);
  return (
    <MarsFrame
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open your civic ID. ${name}, ${status.toLowerCase()}.${place ? ` Home on Mars: ${place.name}.` : ''}`}
      cut={CUT}
      fill={CARD}
      accent
      style={styles.card}
      testID="CivicCard"
    >
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        testID="CivicCard-map"
        onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          setSize(current => (current && current.width === width && current.height === height ? current : { width, height }));
        }}
      >
        {layout ? (
          <Svg width={size.width} height={size.height}>
            <Defs>
              <ClipPath id={clipId}>
                <Path d={cutOutline(size.width, size.height, CUT, 1)} />
              </ClipPath>
              <LinearGradient id={`${clipId}fade`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.38" stopColor={CARD} stopOpacity="0" />
                <Stop offset="0.72" stopColor={CARD} stopOpacity="0.92" />
                <Stop offset="1" stopColor={CARD} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <G clipPath={`url(#${clipId})`}>
              <G transform={`translate(${layout.x} ${layout.y}) scale(${layout.scale})`}>
                <Path d={place.minor} fill="none" stroke={civicColors.orange} strokeOpacity={0.22} strokeWidth={0.7 / layout.scale} />
                <Path d={place.major} fill="none" stroke={civicColors.orange} strokeOpacity={0.55} strokeWidth={1.1 / layout.scale} />
              </G>
              <Line x1={0} y1={layout.spotY} x2={size.width} y2={layout.spotY} {...CROSSHAIR} />
              <Line x1={layout.spotX} y1={0} x2={layout.spotX} y2={size.height} {...CROSSHAIR} />
              <Rect x={0} y={0} width={size.width} height={size.height} fill={`url(#${clipId}fade)`} />
            </G>
          </Svg>
        ) : null}
        {layout ? <View style={[styles.pin, { left: layout.spotX - 6, top: layout.spotY - 6 }]} /> : null}
        {layout ? (
          <View
            testID="CivicCard-tag"
            // Measured first, while invisible, so it can be placed on whichever side has room.
            style={[styles.tag, !tagWidth && styles.measuring, { left: tagLeft, top: layout.spotY - 11 }]}
            onLayout={event => setTagWidth(event.nativeEvent.layout.width)}
          >
            <Text style={styles.tagText} numberOfLines={1}>
              HOME · {place.name.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>

      <FrameHead label="CIVIC IDENTITY" code={address ? `CIV-${address.slice(0, 8).toUpperCase()}` : undefined} />
      <View style={styles.flex} />
      <View style={styles.who}>
        <View style={styles.portrait}>
          <Image style={styles.portraitImage} source={avatar} onError={onAvatarError} />
          {/* The portrait's corners are cut like the card's. */}
          <Svg pointerEvents="none" width={62} height={72} style={StyleSheet.absoluteFill}>
            <Path d="M0 0H10L0 10Z M62 72H52L62 62Z" fill={CARD} />
          </Svg>
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {name}
          </Text>
          <Text style={styles.status}>{status}</Text>
        </View>
      </View>
      <View style={styles.foot}>
        <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">
          {address}
        </Text>
        {place ? <Text style={styles.coordinates}>{place.coordinates}</Text> : null}
      </View>
    </MarsFrame>
  );
}

const styles = StyleSheet.create({
  card: { height: 272, padding: 16, overflow: 'hidden' },
  flex: { flex: 1 },
  pin: { position: 'absolute', width: 12, height: 12, borderWidth: 2, borderColor: civicColors.orange, backgroundColor: CARD },
  tag: { position: 'absolute', backgroundColor: civicColors.orange, paddingHorizontal: 7, paddingVertical: 4 },
  measuring: { opacity: 0 },
  tagText: { fontFamily: 'ChakraPetch-Bold', fontSize: 10.5, letterSpacing: 1, color: civicColors.background },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  portrait: { width: 62, height: 72 },
  portraitImage: { width: 62, height: 72, backgroundColor: '#1D2126' },
  name: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 24, lineHeight: 29 },
  status: { color: civicColors.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 10.5, letterSpacing: 1.8, marginTop: 4 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 },
  address: { flex: 1, color: civicColors.muted, fontFamily: 'ChakraPetch-Regular', fontSize: 11 },
  coordinates: { color: civicColors.muted, fontFamily: 'ChakraPetch-Medium', fontSize: 11, letterSpacing: 0.5 },
});
