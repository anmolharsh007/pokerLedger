/**
 * Presentation-only: a signed ₹ amount, rounded to the nearest rupee —
 * "+₹500" / "-₹120" / "₹0" (never "-₹0"). Shared by every screen that
 * shows a net result (GameSessionsScreen's per-game/Net column,
 * LeaderboardScreen's Net winnings) so they render identically.
 */
export function formatNet(net: number): string {
  const rounded = Math.round(net);
  if (rounded === 0) return '₹0';
  return `${rounded > 0 ? '+' : '-'}₹${Math.abs(rounded)}`;
}
