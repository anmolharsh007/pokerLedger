/**
 * Hardcoded data for components/dev/StaticPreview.tsx — reviewing the
 * Home screen and Table screen's look while the real sign-in/Sheets
 * backend is down. Nothing here is read from or written to a real
 * spreadsheet. Delete alongside StaticPreview.tsx once the backend is
 * fixed and the real flow works again.
 *
 * Each mock table has a different table-screen scenario, so opening
 * them from the static home screen tours all three game states
 * (in-progress / last-played / never-played) instead of just one.
 */
import type { TableHomeMockData } from '../../components/TableHome';
import type { GroupInfo, Player } from '../pokerActions';
import type { LinkedSheet } from '../sheetRegistry';

export const mockTables: LinkedSheet[] = [
  { id: 't1', name: 'Friday Night', spreadsheetId: 'static-friday-night' },
  { id: 't2', name: 'Office Poker Club', spreadsheetId: 'static-office-club' },
  { id: 't3', name: 'High Rollers', spreadsheetId: 'static-high-rollers' },
];

export const mockTableSummaries: Record<string, string[]> = {
  'static-friday-night': ['Game in progress', '₹500 buy-in'],
  'static-office-club': ['Last game played'],
  'static-high-rollers': ['New table'],
};

const players: Player[] = [
  { row: 2, name: 'Aarav', email: 'aarav@example.com', alias: '' },
  { row: 3, name: 'Bhavna', email: 'bhavna@example.com', alias: '' },
  { row: 4, name: 'Chirag', email: '', alias: '' },
  { row: 5, name: 'Divya', email: 'divya@example.com', alias: '' },
  { row: 6, name: 'Esha', email: '', alias: '' },
];

const groups: GroupInfo[] = [
  { name: 'Regulars', members: ['Aarav', 'Bhavna', 'Chirag'] },
  { name: 'Weekend Crew', members: ['Divya', 'Esha'] },
];

const mockByTable: Record<string, TableHomeMockData> = {
  // Game in progress — status row, "Playing:" line, disabled setup
  // fields, Cash-ins/Cash-outs enabled. End is enabled by gameState but
  // blocked by the "3 haven't cashed out" badge until those get entered.
  'static-friday-night': {
    tableInfo: { title: 'Friday Night', usualBuyIn: 500, usualChips: 1000, status: 'in progress', sessionRow: 3, useAlias: false },
    gameInfo: {
      row: 3,
      date: new Date().toISOString().slice(0, 10),
      ratio: 0.5,
      buyInAmount: 500,
      // None cashed out yet — a realistic in-progress state that also
      // demonstrates the End button's "haven't cashed out" badge/gating.
      players: [
        { name: 'Aarav', alias: '', buyIns: 2, finalChips: 0, cashedOut: false },
        { name: 'Bhavna', alias: '', buyIns: 1, finalChips: 0, cashedOut: false },
        { name: 'Chirag', alias: '', buyIns: 1, finalChips: 0, cashedOut: false },
        { name: 'Divya', alias: '', buyIns: 0, finalChips: 0, cashedOut: false },
        { name: 'Esha', alias: '', buyIns: 0, finalChips: 0, cashedOut: false },
      ],
    },
    players,
    groups,
  },
  // Last game played — setup fields re-enabled, All+/Group+ ready for
  // the next game, Cash-ins enabled (there's a session row), Cash-outs/End not.
  'static-office-club': {
    tableInfo: { title: 'Office Poker Club', usualBuyIn: 200, usualChips: 500, status: 'last played', sessionRow: 7, useAlias: false },
    gameInfo: {
      row: 7,
      date: '2026-08-21',
      ratio: 0.4,
      buyInAmount: 200,
      players: [
        { name: 'Aarav', alias: '', buyIns: 3, finalChips: 640, cashedOut: true },
        { name: 'Bhavna', alias: '', buyIns: 2, finalChips: 210, cashedOut: true },
      ],
    },
    players,
    groups,
  },
  // Never played — everything at its starting gate, only All+/Group+ enabled.
  'static-high-rollers': {
    tableInfo: { title: 'High Rollers', usualBuyIn: 2000, usualChips: 2000, status: null, sessionRow: null, useAlias: false },
    gameInfo: null,
    players,
    groups,
  },
};

export function getMockTableData(spreadsheetId: string): TableHomeMockData {
  return mockByTable[spreadsheetId] ?? mockByTable['static-high-rollers'];
}
