/**
 * Presentation-only: which label to show for a player, given a table's
 * "use alias" toggle (TableInfoData.useAlias, lib/pokerActions.ts). Never
 * affects the underlying real-name joins — session-log headers, groups-info
 * formula links, and addSession/startGame/addGroup/updateGroup/cashIn's
 * matching all keep using the real name regardless of what this returns.
 */
export function displayName(player: { name: string; alias: string }, useAlias: boolean): string {
  return useAlias && player.alias.trim() ? player.alias : player.name;
}
