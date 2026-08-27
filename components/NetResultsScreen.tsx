import SimpleSheetList from './SimpleSheetList';
import { TABS } from '../lib/pokerLedgerSeed';

type Props = { spreadsheetId: string; getAccessToken: () => Promise<string> };

export default function NetResultsScreen({ spreadsheetId, getAccessToken }: Props) {
  return (
    <SimpleSheetList
      spreadsheetId={spreadsheetId}
      getAccessToken={getAccessToken}
      range={`${TABS.netResults}!A2:B200`}
      headers={['Player name', 'Total']}
    />
  );
}
