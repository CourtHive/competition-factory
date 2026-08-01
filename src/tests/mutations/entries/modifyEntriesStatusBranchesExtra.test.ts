import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT, INVALID_STAGE } from '@Constants/errorConditionConstants';
import { ALTERNATE, LUCKY_LOSER, WITHDRAWN } from '@Constants/entryStatusConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';

function seed() {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });
  const event = tournamentEngine.getEvent({ eventId }).event as any;
  const participantIds = (event.entries ?? []).map((e: any) => e.participantId);
  return { eventId, drawId, participantIds };
}

test('invalid entryStage is rejected', () => {
  const { eventId, drawId, participantIds } = seed();
  const result = tournamentEngine.modifyEntriesStatus({
    eventId,
    drawId,
    participantIds: [participantIds[0]],
    entryStage: 'NOT_A_STAGE' as any,
    entryStatus: ALTERNATE,
  });
  expect(result.error).toEqual(INVALID_STAGE);
});

test('draw-specific entryStatus at event level (no draw context) is not allowed', () => {
  const { eventId, participantIds } = seed();
  // event-level call (no drawId / flight) with a DRAW_SPECIFIC status
  const result = tournamentEngine.modifyEntriesStatus({
    eventId,
    participantIds: [participantIds[0]],
    entryStatus: LUCKY_LOSER,
  });
  expect(result.error).toEqual(ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT);
});

test('extension is added and then removed on entries', () => {
  const { eventId, drawId, participantIds } = seed();
  const name = 'entryTag';

  // add (extension.value present) — entryStatus optional when an extension is supplied
  let result = tournamentEngine.modifyEntriesStatus({
    eventId,
    drawId,
    participantIds: [participantIds[0]],
    extension: { name, value: { tagged: true } },
  });
  expect(result.success).toEqual(true);

  // remove (extension.value absent)
  result = tournamentEngine.modifyEntriesStatus({
    eventId,
    drawId,
    participantIds: [participantIds[0]],
    extension: { name },
  });
  expect(result.success).toEqual(true);
});

test('entryStage is set on entries', () => {
  const { eventId, drawId, participantIds } = seed();
  const result = tournamentEngine.modifyEntriesStatus({
    eventId,
    drawId,
    participantIds: [participantIds[0]],
    entryStage: QUALIFYING,
    entryStatus: ALTERNATE,
    ignoreAssignment: true,
  });
  expect(result.success).toEqual(true);
});

test('WITHDRAWN withdraws a participant across flights and draws', () => {
  const { eventId, participantIds } = seed();
  const result = tournamentEngine.modifyEntriesStatus({
    eventId,
    participantIds: [participantIds[0]],
    entryStatus: WITHDRAWN,
    ignoreAssignment: true,
  });
  expect(result.success).toEqual(true);
});
