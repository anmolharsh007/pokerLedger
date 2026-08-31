/**
 * A small line-art trash-bin icon — used in place of a plain "✕"/🗑
 * character (TableHome's clear-selected-players button) wherever a
 * proper drawn icon reads better than a font glyph, which renders
 * inconsistently across platforms/fonts. Line-based (stroke, no fill),
 * matching the app's border-only design language elsewhere (see
 * components/ui/Button.tsx, Card.tsx) — a lidded bin with a curved
 * handle and three gently bowed ribs, not a flat Material-style glyph.
 */
import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

export default function TrashIcon({ size = 16, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Lid handle — a small curved arc, not a sharp rectangle */}
      <Path d="M9,6 V4.5 Q9,3.5 10,3.5 H14 Q15,3.5 15,4.5 V6" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {/* Lid bar */}
      <Path d="M4,6 H20" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      {/* Tapered body, rounded at the bottom corners */}
      <Path
        d="M6,6 L7,20 Q7.2,21 8.2,21 H15.8 Q16.8,21 17,20 L18,6"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Three gently curved ribs, not straight lines */}
      <Path d="M10,9 Q9.7,14 10,18" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M12,9 Q12,14 12,18" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M14,9 Q14.3,14 14,18" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}
