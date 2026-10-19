import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants and types
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLES } from '@Constants/eventConstants';
import { SINGLES } from '@Constants/matchUpTypes';

// Standalone matchUps live on tournamentRecord.matchUps, outside every event. They used to be appended to
// allTournamentMatchUps unfiltered, uncopied and with check-in attribution intact (assessment 2026-10-16 H1).

const STANDALONE_ID = 'standalone';
const SENTINEL = 'PRIVATE_SENTINEL';

function attestation(participantId: string) {
  return {
    attributedTo: { attributionType: 'DECLARED', name: SENTINEL, telephone: '555-0100' },
    occurredAt: '2026-10-16T12:00:00Z',
    attestationId: 'a1',
    state: 'CHECKED_IN',
    participantId,
  };
}

function getRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
  const participantId = tournamentRecord.participants[0].participantId;
  const drawnMatchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];
  drawnMatchUp.checkIns = [attestation(participantId)];
  tournamentRecord.matchUps = [
    {
      checkIns: [attestation(participantId)],
      matchUpStatus: TO_BE_PLAYED,
      matchUpId: STANDALONE_ID,
      matchUpType: SINGLES,
    },
  ];
  return { tournamentRecord, drawnMatchUp };
}

test('a matchUpIds filter that names only a drawn matchUp does not return the standalone matchUp', () => {
  const { tournamentRecord, drawnMatchUp } = getRecord();
  const matchUps: any = allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [drawnMatchUp.matchUpId] },
    tournamentRecord,
  }).matchUps;
  expect(matchUps.map(({ matchUpId }) => matchUpId)).toEqual([drawnMatchUp.matchUpId]);
});

test('a matchUpIds filter that names the standalone matchUp returns it alone', () => {
  const { tournamentRecord } = getRecord();
  const matchUps: any = allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [STANDALONE_ID] },
    tournamentRecord,
  }).matchUps;
  expect(matchUps.map(({ matchUpId }) => matchUpId)).toEqual([STANDALONE_ID]);
});

test('other matchUpFilters and contextFilters apply to standalone matchUps', () => {
  const { tournamentRecord } = getRecord();
  const ids = (params) =>
    (allTournamentMatchUps({ tournamentRecord, ...params }).matchUps ?? []).map((m) => m.matchUpId);

  expect(ids({ matchUpFilters: { matchUpTypes: [DOUBLES] } })).not.toContain(STANDALONE_ID);
  expect(ids({ matchUpFilters: { matchUpTypes: [SINGLES] } })).toContain(STANDALONE_ID);
  expect(ids({ contextFilters: { matchUpIds: [STANDALONE_ID] } })).toEqual([STANDALONE_ID]);
});

test('a filter scoped to events, draws or structures excludes standalone matchUps', () => {
  const { tournamentRecord, drawnMatchUp } = getRecord();
  const { eventId } = tournamentRecord.events[0];
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  const { structureId } = tournamentRecord.events[0].drawDefinitions[0].structures[0];

  for (const filters of [{ eventIds: [eventId] }, { drawIds: [drawId] }, { structureIds: [structureId] }]) {
    for (const key of ['matchUpFilters', 'contextFilters']) {
      const matchUps = allTournamentMatchUps({ tournamentRecord, [key]: filters }).matchUps ?? [];
      const matchUpIds = matchUps.map((m) => m.matchUpId);
      expect(matchUpIds).not.toContain(STANDALONE_ID);
      expect(matchUpIds).toContain(drawnMatchUp.matchUpId);
    }
  }
});

test('an inContext standalone matchUp is a copy with check-in attribution stripped, like a drawn one', () => {
  const { tournamentRecord, drawnMatchUp } = getRecord();
  const matchUps: any = allTournamentMatchUps({ tournamentRecord }).matchUps;

  const drawn = matchUps.find((m) => m.matchUpId === drawnMatchUp.matchUpId);
  const standalone = matchUps.find((m) => m.matchUpId === STANDALONE_ID);
  expect(drawn.checkIns[0].attributedTo).toBeUndefined();
  expect(standalone.checkIns[0].attributedTo).toBeUndefined();
  expect(standalone.checkIns[0].participantId).toEqual(drawn.checkIns[0].participantId);

  expect(standalone).not.toBe(tournamentRecord.matchUps[0]);
  standalone.matchUpStatus = 'EDITED';
  standalone.checkIns[0].state = 'EDITED';
  expect(tournamentRecord.matchUps[0].matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(tournamentRecord.matchUps[0].checkIns[0].attributedTo.name).toEqual(SENTINEL);
  expect(tournamentRecord.matchUps[0].checkIns[0].state).toEqual('CHECKED_IN');
});

test('without inContext the stored standalone matchUp is returned, as stored drawn matchUps are', () => {
  const { tournamentRecord, drawnMatchUp } = getRecord();
  const matchUps: any = allTournamentMatchUps({ tournamentRecord, inContext: false }).matchUps;

  expect(matchUps.find((m) => m.matchUpId === drawnMatchUp.matchUpId)).toBe(drawnMatchUp);
  expect(matchUps.find((m) => m.matchUpId === STANDALONE_ID)).toBe(tournamentRecord.matchUps[0]);
});

test('a record with no standalone matchUps returns only drawn matchUps', () => {
  const { tournamentRecord } = getRecord();
  delete tournamentRecord.matchUps;
  const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];
  expect(matchUps.length).toEqual(7);
});
