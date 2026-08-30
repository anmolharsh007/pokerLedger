/**
 * A small rotating palette of bold per-card gradient fills — style
 * variant C's "colors" half (see Card's `tint` prop).
 * Fixed colors, not theme-derived — the point is each card in a grid
 * reads as its own distinct identity, the way the reference stock art
 * used a different saturated color per card. 75% opaque (the trailing
 * "bf") — translucent enough that the screen's own background gradient
 * shows through clearly, not just faintly.
 */
import type { GradientStops } from './tokens';

export const CARD_TINTS: GradientStops[] = [
  ['#f2a65abf', '#d9622bbf', '#8f3a12bf'], // amber
  ['#7ec8e3bf', '#2f6fedbf', '#1b3f99bf'], // blue
  ['#8fd19ebf', '#2f9e52bf', '#155a2cbf'], // green
  ['#e58faebf', '#c94770bf', '#7a1f3dbf'], // rose
];

export function cardTintFor(index: number): GradientStops {
  return CARD_TINTS[index % CARD_TINTS.length];
}
