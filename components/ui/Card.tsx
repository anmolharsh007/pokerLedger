/**
 * Themed surface container — replaces the repeated
 * `{ backgroundColor: '#f4f4f4', borderRadius: 10, padding }` row/card
 * styles scattered across screens.
 *
 * Transparent by default, border only — no fill, no gradient wash.
 * `raised` is the one exception: modal/popover cards (ModalCard) keep a
 * real solid background (`theme.colors.surfaceRaised` + shadow), since
 * they sit over a dimmed backdrop and need to stay legible on their own,
 * unlike a card sitting on the normal screen background.
 *
 * `portrait` switches it into the taller-than-wide, playing-card-like
 * tile used for grids of things (tables, groups, players) — fixed
 * aspect ratio, generous padding, content centered as a block
 * (`justifyContent: 'center'`, with a `gap` between stacked children)
 * rather than spread to the card's top/bottom edges.
 *
 * The border defaults to a beveled look — lighter on top/left, darker
 * on bottom/right, like light catching a raised edge. Pass `borderColor`
 * (CardButton's selected state) to replace that with one flat color on
 * all four sides instead; RN gives the per-side `borderTopColor` etc.
 * precedence over plain `borderColor` whenever both are set, so the
 * bevel can't just be overridden via `style`.
 *
 * `highlighted` is a functional selected state (Cash-ins' cards with a
 * staged buy-in, Cash-outs' cards with a chips value typed in) — a
 * thicker accent border, no wash. `tint`'s middle stop tints the border
 * the same way instead of filling the card — each table/group card's
 * own color identity now reads as an outline color, not a fill.
 * See CardButton for the pressable version of this same shape.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import type { GradientStops } from '../../theme/tokens';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  raised?: boolean; // the one filled exception — see module comment
  portrait?: boolean; // portrait-rectangular tile shape (grids of tables/groups/players)
  borderColor?: string; // flat override for the default bevel (e.g. a selected state)
  borderWidth?: number;
  tint?: GradientStops; // tints the border (its middle stop), not a fill
  badge?: string; // a small gold tag overlapping the bottom edge
  highlighted?: boolean; // functional state — a thicker accent border, no wash
};

export default function Card({ children, style, raised, portrait, borderColor, borderWidth, tint, badge, highlighted }: Props) {
  const theme = useTheme();
  const tintColor = tint ? tint[Math.min(1, tint.length - 1)] : undefined;
  const effectiveBorderColor = borderColor ?? tintColor ?? (highlighted ? theme.colors.accent : undefined);
  const bevel = effectiveBorderColor === undefined;

  return (
    <View
      style={[
        {
          backgroundColor: raised ? theme.colors.surfaceRaised : 'transparent',
          borderRadius: theme.radius.lg,
          borderWidth: borderWidth ?? (highlighted || tintColor ? 2 : 1),
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
        raised && theme.cardShadow,
        style,
      ]}>
      {children}
      {badge && (
        <View style={badgeStyles.wrap} pointerEvents="none">
          <View style={[badgeStyles.chip, { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft }]}>
            <Text style={[badgeStyles.text, { color: theme.colors.accent, fontFamily: theme.font.family.bold }]}>{badge}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: -11, left: 0, right: 0, alignItems: 'center' },
  chip: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
