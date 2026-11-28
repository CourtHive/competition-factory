import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COURT_NOT_FOUND } from '@Constants/errorConditionConstants';

/**
 * A COURT MODIFIED ACROSS SEVERAL LOADED RECORDS IS PLANNED IN EVERY RECORD FIRST. With more than one tournament
 * record loaded, `modifyCourt` modifies the court in each. A record that refuses (here, one that holds no such court)
 * used to be met only after the records before it were written; every record is now planned before any is written.
 */
function loaded({ shared }: { shared: boolean }) {
  const one = mocksEngine.generateTournamentRecord({ venueProfiles: [{ courtsCount: 2 }], nonRandom: 1 });
  const two = mocksEngine.generateTournamentRecord({ nonRandom: 2 });
  // a venue shared by both tournaments holds the same court in each
  if (shared) two.tournamentRecord.venues = structuredClone(one.tournamentRecord.venues);
  tournamentEngine.setState([one.tournamentRecord, two.tournamentRecord]);
  const courtId = one.tournamentRecord.venues[0].courts[0].courtId;
  const records = () => JSON.stringify(tournamentEngine.getState().tournamentRecords);
  return { courtId, records };
}

it('refuses with the records as they were when one record holds no such court', () => {
  const { courtId, records } = loaded({ shared: false });
  const before = records();
  const result: any = tournamentEngine.modifyCourt({ courtId, modifications: { courtName: 'Renamed' } });
  expect(result.error).toEqual(COURT_NOT_FOUND);
  expect(records()).toEqual(before);
});

it('modifies the court in every record that holds it', () => {
  const { courtId } = loaded({ shared: true });
  const result: any = tournamentEngine.modifyCourt({ courtId, modifications: { courtName: 'Renamed' } });
  expect(result.success).toEqual(true);
  const names = Object.values(tournamentEngine.getState().tournamentRecords).map(
    (record: any) => record.venues[0].courts.find((court: any) => court.courtId === courtId).courtName,
  );
  expect(names).toEqual(['Renamed', 'Renamed']);
});
