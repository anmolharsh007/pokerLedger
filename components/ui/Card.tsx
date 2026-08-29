/**
 * Themed surface container — replaces the repeated
 * `{ backgroundColor: '#f4f4f4', borderRadius: 10, padding }` row/card
 * styles scattered across screens.
 *
 * `portrait` switches it into the taller-than-wide, playing-card-like
 * tile used for grids of things (tables, groups, players) — fixed
 * aspect ratio, generous padding, content centered as a block
 * (`justifyContent: 'center'`, with a `gap` between stacked children)
 * rather than spread to the card's top/bottom edges. It also gets a
 * faint surface gradient (top slightly lighter than bottom, like light
 * catching an embossed edge) instead of one flat fill, painted as an
 * absolute-fill layer behind `children` (with its own matching
 * borderRadius, since `overflow: 'hidden'` on this View would clip its
 * own drop shadow on iOS).
 *
 * The border defaults to a beveled look — lighter on top/left, darker
 * on bottom/right, like light catching a raised edge — for the same
 * premium, not-flat read the buttons get from GradientSurface. Pass
 * `borderColor` (CardButton's selected state) to replace that with one
 * flat color on all four sides instead; RN gives the per-side
 * `borderTopColor` etc. precedence over plain `borderColor` whenever
 * both are set, so the bevel can't just be overridden via `style`.
 *
 * `highlighted` is a functional selected/filled state (Cash-ins' cards
 * with a staged buy-in, Cash-outs' cards with a chips value typed in)
 * — an accent border + tinted wash that applies regardless, unlike
 * `tint`/`badge` below (those are style variant C's own decorative
 * "colors and badges" — see theme/ThemeProvider.tsx's `styleVariant`).
 * See CardButton for the pressable version of this same shape.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import GradientSurface from './GradientSurface';
import { useStyleVariant, useTheme } from '../../theme/ThemeProvider';
import type { GradientStops } from '../../theme/tokens';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  raised?: boolean; // use surfaceRaised + shadow (for modal cards, popovers)
  portrait?: boolean; // portrait-rectangular tile shape (grids of tables/groups/players)
  borderColor?: string; // flat override for the default bevel (e.g. a selected state)
  borderWidth?: number;
  tint?: GradientStops; // variant C only — replaces the default surface wash
  badge?: string; // variant C only — a small gold tag overlapping the bottom edge
  highlighted?: boolean; // functional state, all variants — accent border + tinted wash
};

export default function Card({ children, style, raised, portrait, borderColor, borderWidth, tint, badge, highlighted }: Props) {
  const theme = useTheme();
  const styleVariant = useStyleVariant();
  const effectiveBorderColor = borderColor ?? (highlighted ? theme.colors.accent : undefined);
  const bevel = effectiveBorderColor === undefined;
  const richCard = portrait && styleVariant === 'C' && !!tint;

  return (
    <View
      style={[
        {
          backgroundColor: raised ? theme.colors.surfaceRaised : theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: borderWidth ?? (highlighted ? 2 : 1),
          ...(bevel
            ? {
                borderTopColor: theme.bevel.light,
                borderLeftColor: theme.bevel.light,
                borderRightColor: theme.bevel.dark,
                borderBottomColor: theme.bevel.dark,
              }
            : { borderColor: effectiveBorderColor }),
        },
        portrait && {
          aspectRatio: 0.74,
          padding: theme.spacing(4),
          justifyContent: 'center',
          gap: theme.spacing(2),
        },
        (raised || portrait) && theme.cardShadow,
        style,
      ]}>
      {portrait && (
        <GradientSurface
          colors={richCard ? (tint as GradientStops) : theme.gradients.surface}
          sheen={richCard}
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]}
        />
      )}
      {portrait && highlighted && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.lg }]}
        />
      )}
      {children}
      {portrait && styleVariant === 'C' && badge && (
        <View style={badgeStyles.wrap} pointerEvents="none">
          <View style={[badgeStyles.chip, { borderColor: theme.bevel.light }]}>
            <GradientSurface colors={theme.gradients.accent} sheen={false} style={StyleSheet.absoluteFill} />
            <Text style={[badgeStyles.text, { color: theme.colors.accentText, fontFamily: theme.font.family.bold }]}>{badge}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: -11, left: 0, right: 0, alignItems: 'center' },
  chip: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
