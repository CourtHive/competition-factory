import { makeDeepCopy } from '@Tools/makeDeepCopy';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { ALTERNATE, WITHDRAWN } from '@Constants/entryStatusConstants';

const snapshot = () => makeDeepCopy(tournamentEngine.getTournament().tournamentRecord, false, true);

it.each([undefined, 'd1'])(
  'modifyEntriesStatus refuses a mixed [unassigned, assigned] list before writing any entry (drawId: %s)',
  (drawId) => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 8 }, setState: true });
    const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
    let result: any = tournamentEngine.addEvent({ event: { eventId: 'e1', eventName: 'E1' } });
    expect(result.success).toEqual(true);

    // the ALTERNATE is entered first, so it precedes the assigned participants in every entries list
    const unassignedId = participantIds[0];
    result = tournamentEngine.addEventEntries({
      participantIds: [unassignedId],
      entryStatus: ALTERNATE,
      eventId: 'e1',
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addEventEntries({ participantIds: participantIds.slice(1, 5), eventId: 'e1' });
    expect(result.success).toEqual(true);

    const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId: 'e1', drawId: 'd1', drawSize: 4 });
    result = tournamentEngine.addDrawDefinition({ eventId: 'e1', drawDefinition });
    expect(result.success).toEqual(true);

    const assignedIds = tournamentEngine
      .getEvent({ drawId: 'd1' })
      .drawDefinition.structures[0].positionAssignments.map((pa: any) => pa.participantId)
      .filter(Boolean);
    expect(assignedIds).not.toContain(unassignedId);

    const before = snapshot();

    result = tournamentEngine.modifyEntriesStatus({
      participantIds: [unassignedId, assignedIds[0]],
      entryStatus: WITHDRAWN,
      eventId: 'e1',
      drawId,
    });
    expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
    expect(snapshot()).toEqual(before);

    // the unassigned participant alone is still withdrawn
    result = tournamentEngine.modifyEntriesStatus({
      participantIds: [unassignedId],
      entryStatus: WITHDRAWN,
      eventId: 'e1',
      drawId,
    });
    expect(result.success).toEqual(true);
  },
);
