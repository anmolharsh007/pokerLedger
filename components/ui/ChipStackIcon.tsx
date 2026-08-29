/**
 * Three coin-shaped poker chips, overlapping diagonally as if looking
 * down on a small stack from above — used inline next to "chips"
 * labels instead of a coin emoji, which only renders as one flat
 * disc. No SVG library is installed, so this is a tiny composed
 * graphic: three circles, each offset further down-right than the
 * last and rendered in that order, so the front chip properly overlaps
 * the two behind it. Each has a beveled rim (light top/left, dark
 * bottom/right) so it still reads as a coin, not a flat dot.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

// Deep -> mid -> light purple, back chip to front chip — matches the
// fixed "chips" purple used for the Chips field/Cash-outs elsewhere.
const CHIP_COLORS = ['#6a3fc2', '#9b6bf0', '#c9a8f7'];

export default function ChipStackIcon({ size = 16, style }: Props) {
  const chipSize = Math.max(6, Math.round(size * 0.62));
  const offset = Math.max(2, Math.round(size * 0.19));

  return (
    <View style={[{ width: size, height: size }, style]}>
      {CHIP_COLORS.map((color, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * offset,
            top: i * offset,
            width: chipSize,
            height: chipSize,
            borderRadius: chipSize / 2,
            backgroundColor: color,
            borderWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.6)',
            borderLeftColor: 'rgba(255,255,255,0.6)',
            borderRightColor: 'rgba(0,0,0,0.3)',
            borderBottomColor: 'rgba(0,0,0,0.3)',
          }}
        />
      ))}
    </View>
  );
}
