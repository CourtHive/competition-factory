import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { INVALID_ENTRIES } from '@Constants/errorConditionConstants';

function setup() {
  const drawDefinition: DrawDefinition = {
    drawId: 'plain',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: [],
    structures: [],
  };
  const event: Event = {
    eventId: 'doubles',
    eventType: 'DOUBLES',
    entries: [
      { participantId: 'p1', entryStatus: 'UNGROUPED' },
      { participantId: 'p2', entryStatus: 'UNPAIRED' },
      { participantId: 'pair', entryStatus: 'DIRECT_ACCEPTANCE' },
    ],
    drawDefinitions: [drawDefinition],
  };
  const tournamentRecord: Tournament = {
    tournamentId: 't',
    events: [event],
    participants: [
      { participantId: 'p1', participantType: 'INDIVIDUAL' },
      { participantId: 'p2', participantType: 'INDIVIDUAL' },
      { participantId: 'pair', participantType: 'PAIR', individualParticipantIds: ['p1', 'p2'] },
    ],
  };
  tournamentEngine.setState(tournamentRecord);
  return { tournamentRecord, event, drawDefinition, drawId: 'plain' };
}

it.each(['p1', 'p2'])('ordinary doubles refuses accepted individual %s without writing', (participantId) => {
  const context = setup();
  const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  expect(tournamentEngine.addDrawEntries({ drawId: context.drawId, participantIds: [participantId] }).error).toBe(
    INVALID_ENTRIES,
  );
  expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
});

it('ordinary doubles accepts a PAIR entrant', () => {
  const context = setup();
  expect(tournamentEngine.addDrawEntries({ drawId: context.drawId, participantIds: ['pair'] }).success).toBe(true);
  expect(tournamentEngine.getTournament().tournamentRecord.events?.[0].drawDefinitions?.[0].entries).toEqual([
    expect.objectContaining({ participantId: 'pair', entryStatus: 'DIRECT_ACCEPTANCE' }),
  ]);
});

it.each(['UNGROUPED', 'UNPAIRED'] as const)('ordinary doubles preserves %s individual placeholders', (entryStatus) => {
  const context = setup();
  expect(tournamentEngine.addDrawEntries({ drawId: context.drawId, entryStatus, participantIds: ['p1'] }).success).toBe(
    true,
  );
  expect(tournamentEngine.getTournament().tournamentRecord.events?.[0].drawDefinitions?.[0].entries).toEqual([
    expect.objectContaining({ participantId: 'p1', entryStatus }),
  ]);
});
