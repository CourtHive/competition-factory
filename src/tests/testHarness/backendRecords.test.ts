import { getTournamentRecords, setFactoryBackend } from '@Global/state/globalState';
import { afterEach, describe, expect, test } from 'vitest';
import { adoptBackendRecords } from './backendRecords';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';

// constants
import { SUCCESS } from '@Constants/resultConstants';

const LATER = '2030-01-01T00:00:00.000Z';
const STAMPED = new Date(LATER).getTime();

/**
 * A second implementation's answer stands (FACTORY_BACKEND=external): the engine still stamps the records it changed,
 * and only those (second-backend.md; building-a-tournament.md § 1.1).
 */
function twoRecords() {
  const first = mocksEngine.generateTournamentRecord().tournamentRecord;
  const second = mocksEngine.generateTournamentRecord().tournamentRecord;
  tournamentEngine.reset();
  tournamentEngine.setState([first, second]);
  tournamentEngine.setTournamentId(first.tournamentId);
  return { firstId: first.tournamentId, secondId: second.tournamentId };
}

const stampOf = (tournamentId: string) =>
  tournamentEngine.getTournament({ tournamentId }).tournamentRecord.factory?.timeStamp;

// answers setTournamentName as an external process would: every record back, the one it renamed changed
function externalBackend(rename: boolean) {
  setFactoryBackend({
    name: 'external',
    implements: (methodName) => methodName === 'setTournamentName',
    invoke: ({ params }) => {
      const active = tournamentEngine.getTournament().tournamentRecord.tournamentId;
      const records = Object.values(structuredClone(getTournamentRecords())).map((record: any) =>
        rename && record.tournamentId === active ? { ...record, tournamentName: params.tournamentName } : record,
      );
      adoptBackendRecords(records);
      return { ...SUCCESS };
    },
  });
}

afterEach(() => {
  setFactoryBackend();
  setClock();
});

describe('an answer that stands is stamped as the engine stamps its own', () => {
  test('the record the second implementation changed takes the stamp; the other loaded record does not', () => {
    const { firstId, secondId } = twoRecords();
    const secondBefore = stampOf(secondId);
    externalBackend(true);
    setClock(LATER);
    const result: any = tournamentEngine.setTournamentName({ tournamentName: 'Renamed' });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getTournament({ tournamentId: firstId }).tournamentRecord.tournamentName).toEqual(
      'Renamed',
    );
    expect(stampOf(firstId)).toEqual(STAMPED);
    expect(stampOf(secondId)).toEqual(secondBefore);
  });

  test('an answer that changed nothing stamps nothing', () => {
    const { firstId } = twoRecords();
    const before = stampOf(firstId);
    externalBackend(false);
    setClock(LATER);
    const result: any = tournamentEngine.setTournamentName({ tournamentName: 'Renamed' });
    expect(result.success).toEqual(true);
    expect(stampOf(firstId)).toEqual(before);
  });
});
