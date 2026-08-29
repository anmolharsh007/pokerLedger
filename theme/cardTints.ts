/**
 * A small rotating palette of bold per-card gradient fills — style
 * variant C's "colors" half (see Card's `tint` prop, StyleVariantToggle).
 * Fixed colors, not theme-derived — the point is each card in a grid
 * reads as its own distinct identity, the way the reference stock art
 * used a different saturated color per card. ~90% opaque (the trailing
 * "e6"), same as theme.gradients.surface — a little transparency so
 * the screen's own background shows through faintly.
 */
import type { GradientStops } from './tokens';

export const CARD_TINTS: GradientStops[] = [
  ['#f2a65ae6', '#d9622be6', '#8f3a12e6'], // amber
  ['#7ec8e3e6', '#2f6fede6', '#1b3f99e6'], // blue
  ['#8fd19ee6', '#2f9e52e6', '#155a2ce6'], // green
  ['#e58faee6', '#c94770e6', '#7a1f3de6'], // rose
];

export function cardTintFor(index: number): GradientStops {
  return CARD_TINTS[index % CARD_TINTS.length];
}
