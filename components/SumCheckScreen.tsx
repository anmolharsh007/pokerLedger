import SimpleSheetList from './SimpleSheetList';
import { TABS } from '../lib/pokerLedgerSeed';

type Props = { spreadsheetId: string; getAccessToken: () => Promise<string> };

export default function SumCheckScreen({ spreadsheetId, getAccessToken }: Props) {
  return (
    <SimpleSheetList
      spreadsheetId={spreadsheetId}
      getAccessToken={getAccessToken}
      // Data starts at row 3, not row 2 — row 2 is deliberately left
      // blank so sum-check's rows stay aligned 1:1 with session-log's
      // (whose row 2 is its per-player sub-header row). See pokerActions.ts.
      range={`${TABS.sumCheck}!A3:D200`}
      headers={['date', 'buy-ins', 'cash-outs', 'deviation']}
    />
  );
}
