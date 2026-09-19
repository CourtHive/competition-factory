import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CHECKED_IN, CHECKED_OUT } from '@Constants/presenceConstants';
import { CHECK_IN, CHECK_OUT } from '@Constants/timeItemConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * A record written before 7.0.0 carries its check-ins as CHECK_IN / CHECK_OUT timeItems.
 * `migrateTournamentRecord` must promote the WHOLE ordered log, not its most recent entry — the
 * schedule promotions take the latest and discard the rest, which for a log loses the arrival.
 */
function legacyRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
  });

  const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];
  const matchUp = structure.matchUps[0];
  matchUp.timeItems = [
    { itemType: CHECK_IN, itemValue: 'player-a', createdAt: '2023-09-29T16:47:00.398Z' },
    { itemType: CHECK_IN, itemValue: 'player-b', createdAt: '2023-09-29T16:48:00.000Z' },
    { itemType: CHECK_OUT, itemValue: 'player-a', createdAt: '2023-09-29T17:10:00.000Z' },
  ];

  return { tournamentRecord, matchUpId: matchUp.matchUpId };
}

function migratedMatchUp(tournamentRecord: any, matchUpId: string) {
  return tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
    (m: any) => m.matchUpId === matchUpId,
  );
}

it('promotes the whole check-in log, in order, and clears the legacy timeItems', () => {
  const { tournamentRecord, matchUpId } = legacyRecord();
  tournamentEngine.setState(tournamentRecord, false);

  const result: any = tournamentEngine.migrateTournamentRecord({ tournamentRecord });
  expect(result.promoted.matchUpCheckIns).toEqual(3);

  const matchUp = migratedMatchUp(tournamentRecord, matchUpId);

  // three facts, not one — an arrival that was later reversed is still an arrival that happened
  expect(matchUp.checkIns.length).toEqual(3);
  expect(matchUp.checkIns.map((a: any) => a.state)).toEqual([CHECKED_IN, CHECKED_IN, CHECKED_OUT]);
  expect(matchUp.checkIns[0].participantId).toEqual('player-a');
  expect(matchUp.checkIns[0].occurredAt).toEqual('2023-09-29T16:47:00.398Z');

  // nobody recorded an attester, so none is invented
  expect(matchUp.checkIns.every((a: any) => a.attributedTo === undefined)).toEqual(true);

  expect(matchUp.timeItems.filter((t: any) => [CHECK_IN, CHECK_OUT].includes(t.itemType))).toEqual([]);
});

it('is idempotent', () => {
  const { tournamentRecord, matchUpId } = legacyRecord();
  tournamentEngine.setState(tournamentRecord, false);

  tournamentEngine.migrateTournamentRecord({ tournamentRecord });
  const second: any = tournamentEngine.migrateTournamentRecord({ tournamentRecord });

  expect(second.promoted.matchUpCheckIns).toEqual(0);
  expect(migratedMatchUp(tournamentRecord, matchUpId).checkIns.length).toEqual(3);
});
