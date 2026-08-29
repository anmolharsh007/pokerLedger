/**
 * A decorative gradient background layer — the metallic fill used on
 * every solid accent/danger surface (buttons, the action grid, stepper
 * circles, checked checkboxes) instead of one flat hex color, plus the
 * subtler surface wash used behind portrait card tiles.
 *
 * Purely cosmetic: render it as the *first* child of whatever Pressable
 * or View owns the real layout (sizing, padding, flex/width), positioned
 * with `StyleSheet.absoluteFill` so it never competes with that parent
 * for flex/percentage sizing. Either give the parent `overflow: 'hidden'`
 * (fine when nothing on that same view needs a drop shadow — RN clips
 * shadows too under overflow:hidden) or, when it does (Card/ModalCard),
 * give this its own matching `borderRadius` instead and skip the
 * parent's overflow clipping.
 *
 * `sheen` (true by default) also gates the A/B gloss variants below —
 * pass false for small/dense elements (checkboxes, stepper circles)
 * that would look too busy with a highlight+shadow stack, and they'll
 * render the same flat 3-stop fill in every variant.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useStyleVariant } from '../../theme/ThemeProvider';
import type { GradientStops } from '../../theme/tokens';

type Props = {
  colors: GradientStops;
  style?: StyleProp<ViewStyle>;
  sheen?: boolean;
};

// A style key, not a prop — RN deprecated the `pointerEvents` prop in
// favor of this. This layer is purely decorative and must never
// intercept touches meant for the real Pressable/View underneath it.
const NO_EVENTS: ViewStyle = { pointerEvents: 'none' };

// Variant A — refined amplification: a brighter, tighter highlight
// band up top and a darker shadow at the bottom, for more "dome" pop
// than the plain top-fade sheen, while staying restrained.
const GLOSS_A_HIGHLIGHT = ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] as const;
const GLOSS_A_HIGHLIGHT_STOPS = [0, 0.45, 0.6] as const;
const GLOSS_A_SHADOW = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.22)'] as const;
const GLOSS_A_SHADOW_STOPS = [0.75, 1] as const;

// Variant B — full glossy Web 2.0 "gold web button": a warm-tinted
// specular cap and a warm bronze shadow (not neutral white/black —
// that washed the gold out toward grey) plus a fully opaque gold-to-
// bronze border, fixed regardless of theme, since this variant is
// specifically chasing the gold-button reference rather than tinting
// with whatever the active theme's accent happens to be.
const GOLD_BORDER_LIGHT = '#fff2c9';
const GOLD_BORDER_DARK = '#6b4712';
const GLOSS_B_HIGHLIGHT = ['rgba(255,248,222,0.62)', 'rgba(255,248,222,0.4)', 'rgba(255,248,222,0.05)', 'rgba(255,248,222,0)'] as const;
const GLOSS_B_HIGHLIGHT_STOPS = [0, 0.16, 0.4, 0.55] as const;
const GLOSS_B_SHADOW = ['rgba(45,22,0,0)', 'rgba(45,22,0,0.48)'] as const;
const GLOSS_B_SHADOW_STOPS = [0.6, 1] as const;

// Variant C — unchanged baseline (its own richness lives in Card's
// `tint`/`badge`, not in extra button gloss).
const GLOSS_C_HIGHLIGHT = ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)'] as const;
const GLOSS_C_HIGHLIGHT_STOPS = [0, 0.85] as const;

export default function GradientSurface({ colors, style, sheen = true }: Props) {
  const variant = useStyleVariant();

  const goldBorder: ViewStyle | null =
    sheen && variant === 'B'
      ? {
          borderWidth: 2,
          borderTopColor: GOLD_BORDER_LIGHT,
          borderLeftColor: GOLD_BORDER_LIGHT,
          borderRightColor: GOLD_BORDER_DARK,
          borderBottomColor: GOLD_BORDER_DARK,
        }
      : null;

  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, NO_EVENTS, goldBorder]}>
      {sheen && variant === 'B' && (
        <>
          <LinearGradient
            colors={GLOSS_B_HIGHLIGHT}
            locations={GLOSS_B_HIGHLIGHT_STOPS}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={GLOSS_B_SHADOW}
            locations={GLOSS_B_SHADOW_STOPS}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      {sheen && variant === 'A' && (
        <>
          <LinearGradient
            colors={GLOSS_A_HIGHLIGHT}
            locations={GLOSS_A_HIGHLIGHT_STOPS}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={GLOSS_A_SHADOW}
            locations={GLOSS_A_SHADOW_STOPS}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      {sheen && variant === 'C' && (
        <LinearGradient
          colors={GLOSS_C_HIGHLIGHT}
          locations={GLOSS_C_HIGHLIGHT_STOPS}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </LinearGradient>
  );
}
