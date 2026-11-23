import { deleteParticipants } from '@Mutate/participants/deleteParticipants';
import { destroyGroupEntry } from '@Mutate/entries/destroyGroupEntry';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { expect, it } from 'vitest';

// constants and types
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { Event, Tournament } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  CANNOT_REMOVE_PARTICIPANTS,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  MISSING_EVENT,
} from '@Constants/errorConditionConstants';

/**
 * A mutation that refuses must leave the record as it was. `deleteParticipants` removed a participant's
 * entries event by event, and `removeEventEntries` refused only at the event where the participant held a
 * drawPosition — so every earlier event had already lost its entry. The draw-assignment pre-check skipped
 * TEAM draws, which is how a positioned TEAM participant reached the loop.
 */

// TEAM participants entered in `unpositionedEventsCount` undrawn TEAM events listed BEFORE the TEAM event
// whose draw positions them
function teamParticipantPositionedInALaterEvent(unpositionedEventsCount = 1) {
  const {
    tournamentRecord: generated,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
  });
  tournamentEngine.setState(generated);

  const positionedEvent: Event = tournamentEngine.getEvent({ drawId }).event;
  const teamParticipantIds = (positionedEvent.entries ?? []).map(({ participantId }) => participantId);

  const unpositionedEventIds: string[] = [];
  for (let i = 0; i < unpositionedEventsCount; i++) {
    const added = tournamentEngine.addEvent({
      event: { eventType: TEAM, eventName: `Unpositioned ${i}`, tieFormatName: DOMINANT_DUO },
    });
    expect(added.success).toEqual(true);
    const entered = tournamentEngine.addEventEntries({
      participantIds: teamParticipantIds,
      eventId: added.event.eventId,
    });
    expect(entered.success).toEqual(true);
    unpositionedEventIds.push(added.event.eventId);
  }

  const tournamentRecord: Tournament = tournamentEngine.getTournament().tournamentRecord;
  // the positioned event goes LAST, so the per-event loop reaches the unpositioned ones first
  const events = tournamentRecord.events ?? [];
  tournamentRecord.events = [...events.slice(1), events[0]];
  expect(tournamentRecord.events.at(-1)?.eventId).toEqual(positionedEvent.eventId);

  return { tournamentRecord, teamParticipantIds, unpositionedEventIds };
}

// TEAM participants entered in two undrawn TEAM events: no drawPosition anywhere
function teamParticipantEnteredInTwoEvents() {
  const { tournamentRecord: generated } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO, generate: false }],
  });
  tournamentEngine.setState(generated);
  const teamParticipantIds = (tournamentEngine.getTournament().tournamentRecord.events[0].entries ?? []).map(
    ({ participantId }) => participantId,
  );
  const added = tournamentEngine.addEvent({
    event: { eventType: TEAM, eventName: 'Second', tieFormatName: DOMINANT_DUO },
  });
  const entered = tournamentEngine.addEventEntries({
    participantIds: teamParticipantIds,
    eventId: added.event.eventId,
  });
  expect(entered.success).toEqual(true);

  const tournamentRecord: Tournament = tournamentEngine.getTournament().tournamentRecord;
  return { tournamentRecord, teamParticipantIds };
}

it('refuses to delete a TEAM participant positioned in a later TEAM draw, and changes nothing', () => {
  const { tournamentRecord, teamParticipantIds } = teamParticipantPositionedInALaterEvent();
  const before = makeDeepCopy(tournamentRecord, false, true);

  const result = deleteParticipants({ tournamentRecord, participantIds: [teamParticipantIds[0]] });

  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
  expect(tournamentRecord).toEqual(before);
});

it('destroyGroupEntry keeps the TEAM participant and touches no other event when its deletion is refused', () => {
  const { tournamentRecord, teamParticipantIds, unpositionedEventIds } = teamParticipantPositionedInALaterEvent(2);
  const [destroyedEventId, bystanderEventId] = unpositionedEventIds;
  const participantId = teamParticipantIds[0];

  const findEvent = (eventId: string) => (tournamentRecord.events ?? []).find((event) => event.eventId === eventId);
  const bystanderBefore = makeDeepCopy(findEvent(bystanderEventId), false, true);
  const participantsBefore = makeDeepCopy(tournamentRecord.participants, false, true);

  const result = destroyGroupEntry({
    event: findEvent(destroyedEventId) as Event,
    removeGroupParticipant: true,
    drawDefinition: undefined as any,
    tournamentRecord,
    participantId,
  });

  // the group entry is destroyed in the event asked for; deleting the participant is declined
  expect(result.success).toEqual(true);
  expect(result.participantRemoved).toBeFalsy();
  expect(findEvent(destroyedEventId)?.entries?.some((entry) => entry.participantId === participantId)).toEqual(false);
  // and the declined delete wrote nothing
  expect(findEvent(bystanderEventId)).toEqual(bystanderBefore);
  expect(tournamentRecord.participants).toEqual(participantsBefore);
});

it('refuses ids that name no participant without first removing their entries or grouping memberships', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO, generate: false }],
  });
  const ghostId = 'not-a-participant';
  const team = (tournamentRecord.participants ?? []).find(
    ({ participantType }) => participantType === TEAM_PARTICIPANT,
  );
  team?.individualParticipantIds?.push(ghostId);
  tournamentRecord.events?.[0].entries?.push({
    entryStatus: DIRECT_ACCEPTANCE,
    participantId: ghostId,
    entryStage: MAIN,
  });
  const before = makeDeepCopy(tournamentRecord, false, true);

  const result = deleteParticipants({ tournamentRecord, participantIds: [ghostId] });

  expect(result.error).toEqual(CANNOT_REMOVE_PARTICIPANTS);
  expect(tournamentRecord).toEqual(before);
});

it('refuses a record holding an event without an eventId before writing any event', () => {
  // nothing is positioned, so only the malformed event — listed after both entered events — can refuse
  const { tournamentRecord, teamParticipantIds } = teamParticipantEnteredInTwoEvents();
  tournamentRecord.events?.push({ eventName: 'malformed' } as Event);
  const before = makeDeepCopy(tournamentRecord, false, true);

  const result = deleteParticipants({ tournamentRecord, participantIds: [teamParticipantIds[0]] });

  expect(result.error).toEqual(MISSING_EVENT);
  expect(tournamentRecord).toEqual(before);
});

it('still deletes a TEAM participant entered in several events when it holds no drawPosition', () => {
  const { tournamentRecord, teamParticipantIds } = teamParticipantEnteredInTwoEvents();
  const participantId = teamParticipantIds[0];

  const result = deleteParticipants({ tournamentRecord, participantIds: [participantId] });

  expect(result.success).toEqual(true);
  expect(result.participantsRemovedCount).toEqual(1);
  expect(tournamentRecord.participants?.some((participant) => participant.participantId === participantId)).toEqual(
    false,
  );
  expect(tournamentRecord.events?.length).toEqual(2);
  for (const event of tournamentRecord.events ?? []) {
    expect(event.entries?.some((entry) => entry.participantId === participantId)).toEqual(false);
    expect(event.entries?.length).toEqual(3);
  }
});
