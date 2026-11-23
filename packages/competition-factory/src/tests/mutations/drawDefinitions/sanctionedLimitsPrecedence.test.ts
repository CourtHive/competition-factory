import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DRAW_ID_EXISTS, NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS } from '@Constants/errorConditionConstants';
import { ALTERNATE, DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

/*
 * Which sanctioned limit addDrawDefinition applies and names (event-governor.md, addDrawDefinition;
 * tournament-governor.md, setSanctionConstraints): the first matching constraint applies, WILDCARD is checked before
 * ALTERNATE, and the limits are checked before an existing drawId is refused.
 */

// an unsanctioned SINGLES event with a generated, unstored draw holding 8 accepted, 3 WILDCARD and 3 ALTERNATE entries
function seedDraw() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Open', eventType: SINGLES_EVENT }],
    participantsProfile: { participantsCount: 32 },
    setState: true,
  });
  const ids = tournamentEngine.getParticipants().participants.map((p) => p.participantId);
  const groups: [string[], string][] = [
    [ids.slice(0, 5), DIRECT_ACCEPTANCE],
    [ids.slice(5, 8), WILDCARD],
    [ids.slice(8, 11), ALTERNATE],
  ];
  let result: any;
  for (const [participantIds, entryStatus] of groups) {
    result = tournamentEngine.addEventEntries({ participantIds, entryStatus, eventId });
    expect(result.success).toEqual(true);
  }
  const drawEntries = groups.flatMap(([participantIds, entryStatus]) =>
    participantIds.map((participantId) => ({ participantId, entryStatus, entryStage: MAIN })),
  );
  result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8, drawEntries });
  expect(result.success).toEqual(true);
  return { eventId, drawDefinition: result.drawDefinition, wildcardIds: ids.slice(5, 8) };
}

function sanction(events: any[]) {
  const result: any = tournamentEngine.addTournamentExtension({
    extension: { name: SANCTIONING_CONSTRAINTS, value: { events } },
  });
  expect(result.success).toEqual(true);
}

it('applies the first matching constraint when several match the event', () => {
  const { eventId, drawDefinition } = seedDraw();
  sanction([
    { eventType: SINGLES_EVENT, maxWildcards: 5 },
    { eventType: SINGLES_EVENT, eventName: 'Open', maxWildcards: 1 },
  ]);
  let result: any = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  // the first allows five wildcards; the second, more specific, is never read
  expect(result.success).toEqual(true);
});

it('names the WILDCARD limit when the draw exceeds both, and checks before an existing drawId', () => {
  const { eventId, drawDefinition, wildcardIds } = seedDraw();
  sanction([{ eventType: SINGLES_EVENT, maxWildcards: 2, maxAlternates: 2 }]);
  let result: any = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
  expect(result.info).toEqual('WILDCARD entries exceed the sanctioned limit');
  expect(result.context).toEqual({
    entryStatus: WILDCARD,
    stage: MAIN,
    limit: 2,
    count: 3,
    participantIds: [wildcardIds[2]],
  });

  // stored without the sanction, the same draw added again is refused for its limits, not for its drawId
  sanction([]);
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.error).toEqual(DRAW_ID_EXISTS);
  sanction([{ eventType: SINGLES_EVENT, maxWildcards: 2 }]);
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
});
