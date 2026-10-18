import { captureNotices, conformanceViolations } from './noticeConformance/harness';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, UNGROUPED, WITHDRAWN } from '@Constants/entryStatusConstants';
import { MAIN, ROUND_ROBIN, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { ASSIGN_BYE, MODIFY_PAIR_ASSIGNMENT } from '@Constants/positionActionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DOUBLES_EVENT, TEAM } from '@Constants/eventConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { PAIR } from '@Constants/participantConstants';
import { FEMALE } from '@Constants/genderConstants';
import { DOUBLES } from '@Constants/matchUpTypes';
import {
  EXISTING_POLICY_TYPE,
  INVALID_ENTRY_STATUS,
  INVALID_VALUES,
  MISSING_ENTRIES,
  POLICY_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_DRAW_ENTRIES,
  MODIFY_EVENT,
  MODIFY_EVENT_ENTRIES,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  PUBLISH_EVENT_SEEDING,
  UNPUBLISH_EVENT_SEEDING,
} from '@Constants/topicConstants';

/**
 * Notice completeness for the event and entries writers (batch B of "every mutation fires a notice").
 *
 * Each case runs one engine call with every topic subscribed (the conformance harness's capture), then
 * asserts the notice the change needs AND that the conformance rules find nothing uncovered. A refused
 * call, or one that changes nothing, sends no notice on the topic.
 */

function observe(call: () => any) {
  const before = tournamentEngine.getTournament().tournamentRecord;
  let result: any;
  const notices = captureNotices(() => {
    result = call();
  });
  const after = tournamentEngine.getTournament().tournamentRecord;
  const payloads = (topic: string) => notices.filter((notice) => notice.topic === topic).map((n) => n.payload);
  return { result, payloads, violations: conformanceViolations(before, after, notices) };
}

function singlesEvent() {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 12 },
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  return { tournamentId: tournamentRecord.tournamentId, eventId, drawId };
}

// an event of 16 entries split into two flights, with no draw generated for either
function flightedEvent() {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Flighted', participantsProfile: { participantsCount: 16 } }],
    setState: true,
  });
  const result = tournamentEngine.generateFlightProfile({ eventId, flightsCount: 2, attachFlightProfile: true });
  expect(result.success).toEqual(true);
  const { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  const [first, second] = flightProfile.flights;
  return { tournamentId: tournamentRecord.tournamentId, eventId, first, second };
}

function teamEvent() {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    setState: true,
  });
  const { event } = tournamentEngine.getEvent({ eventId });
  const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;
  return { tournamentId: tournamentRecord.tournamentId, eventId, drawId, collectionId };
}

describe('event attribute writers announce the event with MODIFY_EVENT', () => {
  it('addEventExtension and removeEventExtension', () => {
    const { tournamentId, eventId } = singlesEvent();
    const extension = { name: 'notice-batch-b', value: { a: 1 } };

    let observed = observe(() => tournamentEngine.addEventExtension({ eventId, extension }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.payloads(MODIFY_EVENT)[0].event.eventId).toEqual(eventId);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.addEventExtension({ eventId, extension: { name: 'x' } }));
    expect(observed.result.error).toEqual(INVALID_VALUES);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);

    observed = observe(() => tournamentEngine.removeEventExtension({ eventId, name: extension.name }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);

    // nothing left to remove: no change, no notice
    observed = observe(() => tournamentEngine.removeEventExtension({ eventId, name: extension.name }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);
  });

  it('addEventTimeItem and addTimeItem naming an event', () => {
    const { tournamentId, eventId } = singlesEvent();
    const timeItem = { itemType: 'RETRIEVAL.RATING.SINGLES.U18', itemValue: '2021-01-01T00:00' };

    let observed = observe(() => tournamentEngine.addEventTimeItem({ eventId, timeItem }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.violations).toEqual([]);

    // the same value again, duplicates refused: nothing is written
    observed = observe(() =>
      tournamentEngine.addEventTimeItem({ eventId, timeItem: { ...timeItem }, duplicateValues: false }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);

    observed = observe(() => tournamentEngine.addTimeItem({ eventId, timeItem: { itemType: 'OTHER', itemValue: 1 } }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });

  it('attachPolicies and removePolicy on an event', () => {
    const { eventId } = singlesEvent();
    const policyDefinitions = { [POLICY_TYPE_SCORING]: { policyName: 'batch B', requireAllPositionsAssigned: true } };

    let observed = observe(() => tournamentEngine.attachPolicies({ eventId, policyDefinitions }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.attachPolicies({ eventId, policyDefinitions }));
    expect(observed.result.error).toEqual(EXISTING_POLICY_TYPE);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);

    observed = observe(() => tournamentEngine.removePolicy({ eventId, policyType: POLICY_TYPE_SCORING }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removePolicy({ eventId, policyType: POLICY_TYPE_SCORING }));
    expect(observed.result.error).toEqual(POLICY_NOT_FOUND);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);
  });

  it('modifyEventMatchUpFormatTiming and removeEventMatchUpFormatTiming', () => {
    const { tournamentId, eventId } = singlesEvent();
    const matchUpFormat = 'SET3-S:6/TB7';

    let observed = observe(() =>
      tournamentEngine.modifyEventMatchUpFormatTiming({ eventId, matchUpFormat, averageMinutes: 127 }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.modifyEventMatchUpFormatTiming({ eventId, matchUpFormat }));
    expect(observed.result.error).toEqual(INVALID_VALUES);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);

    observed = observe(() => tournamentEngine.removeEventMatchUpFormatTiming({ eventId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeEventMatchUpFormatTiming({ eventId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);
  });

  it('setParticipantScaleItems with an event context records the context on the event', () => {
    const { eventId } = singlesEvent();
    const { event } = tournamentEngine.getEvent({ eventId });
    const participantId = event.entries[0].participantId;
    const scaleItem = { scaleType: 'RANKING', eventType: 'SINGLES', scaleName: 'U18', scaleValue: 3 };

    const observed = observe(() =>
      tournamentEngine.setParticipantScaleItems({
        scaleItemsWithParticipantIds: [{ participantId, scaleItems: [scaleItem] }],
        context: { eventId, scaleAttributes: { scaleType: 'RANKING' }, scaleBasis: 'batch B' },
      }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });

  // harness rule, not the factory: the seeding topics already announce the event
  it('publishEventSeeding and unPublishEventSeeding are covered by their own topics', () => {
    const { eventId } = singlesEvent();

    let observed = observe(() => tournamentEngine.publishEventSeeding({ eventId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(PUBLISH_EVENT_SEEDING)).toEqual([expect.objectContaining({ eventId })]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.unPublishEventSeeding({ eventId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(UNPUBLISH_EVENT_SEEDING)).toEqual([expect.objectContaining({ eventId })]);
    expect(observed.violations).toEqual([]);
  });
});

describe('tieFormat writers announce the event whose tieFormats they change', () => {
  it('aggregateTieFormats', () => {
    const { tournamentId, eventId } = teamEvent();

    let observed = observe(() => tournamentEngine.aggregateTieFormats());
    expect(observed.result.success).toEqual(true);
    expect(observed.result.addedCount).toBeGreaterThan(0);
    expect(observed.payloads(MODIFY_EVENT).map(({ event }) => event.eventId)).toEqual([eventId]);
    expect(observed.payloads(MODIFY_EVENT)[0].tournamentId).toEqual(tournamentId);
    expect(observed.violations).toEqual([]);

    // already aggregated: nothing changes
    observed = observe(() => tournamentEngine.aggregateTieFormats());
    expect(observed.result.addedCount).toEqual(0);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);
  });

  it('aggregateTieFormats announces a draw whose own tieFormat it centralises', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });
    // a draw carrying its own inline tieFormat, as a record from before aggregation would
    const event = tournamentRecord.events[0];
    event.drawDefinitions[0].tieFormat = { ...structuredClone(event.tieFormat), tieFormatName: 'Draw Format' };
    tournamentEngine.setState(tournamentRecord);

    const observed = observe(() => tournamentEngine.aggregateTieFormats());
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_DRAW_DEFINITION).map(({ drawDefinition }) => drawDefinition.drawId)).toEqual([
      drawId,
    ]);
    expect(observed.violations).toEqual([]);
  });

  it('addCollectionDefinition, modifyCollectionDefinition, removeCollectionDefinition at event scope', () => {
    const { tournamentId, eventId, drawId, collectionId } = teamEvent();
    const collectionDefinition = {
      collectionName: 'Mixed Doubles',
      matchUpFormat: 'SET3-S:6/TB7',
      matchUpType: DOUBLES,
      matchUpCount: 1,
      matchUpValue: 1,
    };

    let observed = observe(() => tournamentEngine.addCollectionDefinition({ eventId, collectionDefinition }));
    expect(observed.result.error).toBeUndefined();
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.violations).toEqual([]);

    observed = observe(() =>
      tournamentEngine.modifyCollectionDefinition({ eventId, collectionId, collectionName: 'Renamed' }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);

    // the same name again: no modification, no notice
    observed = observe(() =>
      tournamentEngine.modifyCollectionDefinition({ eventId, collectionId, collectionName: 'Renamed' }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.result.modifications).toEqual([]);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);

    observed = observe(() => tournamentEngine.removeCollectionDefinition({ eventId, drawId, collectionId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });

  it('modifyTieFormat at event scope', () => {
    const { eventId } = teamEvent();
    const { event } = tournamentEngine.getEvent({ eventId });
    const modifiedTieFormat = structuredClone(event.tieFormat);
    modifiedTieFormat.collectionDefinitions[0].collectionName = 'Modified';

    const observed = observe(() =>
      tournamentEngine.modifyTieFormat({ eventId, modifiedTieFormat, considerations: { collectionName: true } }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });

  it('removeCollectionGroup and addCollectionGroup at event scope', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: 'USTA_BREWER_CUP' }],
      setState: true,
    });

    let observed = observe(() =>
      tournamentEngine.removeCollectionGroup({ tieFormatName: 'No Group', collectionGroupNumber: 1, eventId }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);

    const { event } = tournamentEngine.getEvent({ eventId });
    const collectionIds = event.tieFormat.collectionDefinitions
      .filter((definition) => !definition.collectionGroupNumber)
      .slice(0, 2)
      .map((definition) => definition.collectionId);

    observed = observe(() =>
      tournamentEngine.addCollectionGroup({
        groupDefinition: { groupName: 'New Group', groupValue: 1, winCriteria: { valueGoal: 1 } },
        tieFormatName: 'With Group',
        collectionIds,
        eventId,
      }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });

  it('modifyCollectionDefinition announces the TEAM matchUps it rewrites', () => {
    const { drawId, collectionId } = teamEvent();
    const teamMatchUpIds = tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM], drawIds: [drawId] } })
      .matchUps.map(({ matchUpId }) => matchUpId);
    expect(teamMatchUpIds).toHaveLength(1);

    // a new matchUpCount gives the TEAM matchUp its own tieFormat and new tieMatchUps
    let observed = observe(() =>
      tournamentEngine.modifyCollectionDefinition({ matchUpCount: 5, collectionId, drawId }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_MATCHUP).map(({ matchUp }) => matchUp.matchUpId)).toEqual(teamMatchUpIds);
    expect(observed.violations).toEqual([]);

    // a new gender prunes the collection's assignments from the TEAM matchUp's lineUps
    observed = observe(() =>
      tournamentEngine.modifyCollectionDefinition({ collectionName: 'Gendered', gender: FEMALE, collectionId, drawId }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_MATCHUP).map(({ matchUp }) => matchUp.matchUpId)).toEqual(teamMatchUpIds);
    expect(observed.violations).toEqual([]);
  });
});

describe('entries writers announce the entries, and the flight profile, they change', () => {
  it('addDrawEntries into a flight with no draw modifies the event', () => {
    const { tournamentId, eventId, first, second } = flightedEvent();
    const participantId = second.drawEntries[0].participantId;

    let observed = observe(() =>
      tournamentEngine.addDrawEntries({ eventId, drawId: first.drawId, participantIds: [participantId] }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.violations).toEqual([]);

    // a participant who is not entered in the event is refused
    observed = observe(() =>
      tournamentEngine.addDrawEntries({ eventId, drawId: first.drawId, participantIds: ['not-entered'] }),
    );
    expect(observed.result.error).toEqual(MISSING_ENTRIES);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);
  });

  it('addDrawEntries and addEventEntries with a drawId announce the draw entries', () => {
    const { tournamentId, eventId, drawId } = singlesEvent();
    const { participants } = tournamentEngine.getParticipants();
    const { event } = tournamentEngine.getEvent({ eventId });
    const entered = event.entries.map(({ participantId }) => participantId);
    const [first, second] = participants
      .filter(({ participantId }) => !entered.includes(participantId))
      .map(({ participantId }) => participantId);

    let observed = observe(() =>
      tournamentEngine.addEventEntries({ eventId, drawId, participantIds: [first], entryStatus: ALTERNATE }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT_ENTRIES)).toHaveLength(1);
    expect(observed.payloads(MODIFY_DRAW_ENTRIES)).toEqual([expect.objectContaining({ drawId, tournamentId })]);
    expect(observed.violations).toEqual([]);

    expect(tournamentEngine.addEventEntries({ eventId, participantIds: [second], entryStatus: ALTERNATE }).success);
    observed = observe(() =>
      tournamentEngine.addDrawEntries({ eventId, drawId, participantIds: [second], entryStatus: ALTERNATE }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_DRAW_ENTRIES)).toEqual([expect.objectContaining({ drawId, eventId })]);
    expect(observed.violations).toEqual([]);
  });

  it('modifyEntriesStatus WITHDRAWN across flights and draws modifies the event', () => {
    const { eventId } = singlesEvent();
    const { event } = tournamentEngine.getEvent({ eventId });
    const participantId = event.entries[0].participantId;

    const observed = observe(() =>
      tournamentEngine.modifyEntriesStatus({
        participantIds: [participantId],
        entryStatus: WITHDRAWN,
        ignoreAssignment: true,
        eventId,
      }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });

  it('promoteAlternate announces the event and draw entries it promotes', () => {
    const { eventId, drawId } = singlesEvent();
    const { participants } = tournamentEngine.getParticipants();
    const { event } = tournamentEngine.getEvent({ eventId });
    const entered = event.entries.map(({ participantId }) => participantId);
    const alternateId = participants.find(({ participantId }) => !entered.includes(participantId)).participantId;
    expect(
      tournamentEngine.addEventEntries({ eventId, drawId, participantIds: [alternateId], entryStatus: ALTERNATE })
        .success,
    ).toEqual(true);

    let observed = observe(() => tournamentEngine.promoteAlternate({ eventId, drawId, participantId: alternateId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT_ENTRIES)).toEqual([expect.objectContaining({ eventId })]);
    expect(observed.payloads(MODIFY_DRAW_ENTRIES)).toEqual([expect.objectContaining({ drawId })]);
    expect(observed.violations).toEqual([]);

    // no longer an alternate: refused
    observed = observe(() => tournamentEngine.promoteAlternate({ eventId, drawId, participantId: alternateId }));
    expect(observed.result.error).toEqual(INVALID_ENTRY_STATUS);
    expect(observed.payloads(MODIFY_EVENT_ENTRIES)).toEqual([]);
  });

  it('seedWithdrawalCascade announces the withdrawn draw entry', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 32, seedsCount: 8 }], setState: true });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
    const seed3 = structure.seedAssignments.find(({ seedNumber }) => seedNumber === 3);
    const drawPosition = structure.positionAssignments.find(
      ({ participantId }) => participantId === seed3.participantId,
    ).drawPosition;

    const observed = observe(() =>
      tournamentEngine.seedWithdrawalCascade({ drawId, structureId: structure.structureId, drawPosition }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_DRAW_ENTRIES)).toEqual([expect.objectContaining({ drawId })]);
    expect(observed.violations).toEqual([]);
  });

  it('modifyPairAssignment announces the entries and positionAssignments it rewrites', () => {
    for (const drawType of [undefined, ROUND_ROBIN]) {
      const {
        tournamentRecord,
        drawIds: [drawId],
        eventIds: [eventId],
      } = mocksEngine.generateTournamentRecord({
        participantsProfile: { participantsCount: 10, participantType: PAIR },
        drawProfiles: [{ drawSize: 8, eventType: DOUBLES_EVENT, drawType }],
      });
      tournamentEngine.setState(tournamentRecord);

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const enteredIds = drawDefinition.entries.map(({ participantId }) => participantId);
      const enteredIndividualIds = tournamentRecord.participants
        .filter(({ participantId }) => enteredIds.includes(participantId))
        .flatMap(({ individualParticipantIds }) => individualParticipantIds);
      const ungroupedIds = tournamentRecord.participants
        .filter(
          ({ participantType, participantId }) =>
            participantType !== PAIR && !enteredIndividualIds.includes(participantId),
        )
        .map(({ participantId }) => participantId);
      expect(
        tournamentEngine.addEventEntries({ eventId, participantIds: ungroupedIds, entryStatus: UNGROUPED }).success,
      );

      const structure = drawDefinition.structures[0];
      const structureId = (structure.structures?.[0] ?? structure).structureId;
      const actions = tournamentEngine.positionActions({ drawId, structureId, drawPosition: 1 });
      const modifyAction = actions.validActions.find(({ type }) => type === MODIFY_PAIR_ASSIGNMENT);
      const params = {
        ...modifyAction.payload,
        existingIndividualParticipantId: modifyAction.existingIndividualParticipantIds[0],
        replacementIndividualParticipantId: modifyAction.availableIndividualParticipantIds[0],
      };

      const observed = observe(() => tournamentEngine[modifyAction.method](params));
      expect(observed.result.success).toEqual(true);
      expect(observed.payloads(MODIFY_EVENT_ENTRIES)).toEqual([expect.objectContaining({ eventId })]);
      expect(observed.payloads(MODIFY_DRAW_ENTRIES)).toEqual([expect.objectContaining({ drawId })]);
      expect(observed.payloads(MODIFY_POSITION_ASSIGNMENTS)).toEqual([
        expect.objectContaining({ drawId, structureId: structure.structureId }),
      ]);
      expect(observed.violations).toEqual([]);
    }
  });

  it('resetVoluntaryConsolationStructure with resetEntries announces the draw entries', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, voluntaryConsolation: {} }],
      completeAllMatchUps: true,
      setState: true,
    });
    const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
      matchUpsLimit: 1,
      drawId,
    });
    const participantIds = eligibleParticipants.map(({ participantId }) => participantId);
    expect(
      tournamentEngine.addDrawEntries({
        entryStage: VOLUNTARY_CONSOLATION,
        entryStatus: DIRECT_ACCEPTANCE,
        participantIds,
        drawId,
      }).success,
    ).toEqual(true);

    let observed = observe(() => tournamentEngine.resetVoluntaryConsolationStructure({ drawId, resetEntries: true }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_DRAW_ENTRIES)).toEqual([expect.objectContaining({ drawId })]);
    expect(observed.violations).toEqual([]);

    // no consolation entries left to reset
    observed = observe(() => tournamentEngine.resetVoluntaryConsolationStructure({ drawId, resetEntries: true }));
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_DRAW_ENTRIES)).toEqual([]);
  });

  it('removeDrawEntries from a flight with no draw modifies the event', () => {
    const { tournamentId, eventId, first } = flightedEvent();
    const participantId = first.drawEntries[0].participantId;

    let observed = observe(() =>
      tournamentEngine.removeDrawEntries({ eventId, drawId: first.drawId, participantIds: [participantId] }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.violations).toEqual([]);

    // already removed: nothing changes
    observed = observe(() =>
      tournamentEngine.removeDrawEntries({ eventId, drawId: first.drawId, participantIds: [participantId] }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT)).toEqual([]);
  });

  it('removeDrawPositionAssignment to ALTERNATE announces every entries list it re-sequences', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, participantsCount: 30 }],
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const actions = tournamentEngine.positionActions({ drawId, structureId, drawPosition: 1 });
    const assignBye = actions.validActions.find(({ type }) => type === ASSIGN_BYE);

    const observed = observe(() =>
      tournamentEngine[assignBye.method]({ ...assignBye.payload, replaceWithBye: true, entryStatus: ALTERNATE }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.payloads(MODIFY_EVENT_ENTRIES)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });

  it('deleteFlightProfileAndFlightDraws modifies the event when there are no draws to delete', () => {
    const { tournamentId, eventId } = flightedEvent();

    const observed = observe(() => tournamentEngine.deleteFlightProfileAndFlightDraws({ eventId }));
    expect(observed.result.success).toEqual(true);
    expect(tournamentEngine.getFlightProfile({ eventId }).flightProfile).toBeUndefined();
    expect(observed.payloads(MODIFY_EVENT)).toEqual([expect.objectContaining({ tournamentId })]);
    expect(observed.violations).toEqual([]);
  });

  it('deleteDrawDefinitions announces an event whose only change is the deletion record', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    const event = tournamentRecord.events[0];
    // no flight profile: before this change only a pruned flight profile was announced
    event.extensions = event.extensions?.filter(({ name }) => name !== FLIGHT_PROFILE);
    delete (event as any).flightProfile;
    tournamentEngine.setState(tournamentRecord);
    const drawId = event.drawDefinitions[0].drawId;

    const observed = observe(() =>
      tournamentEngine.deleteDrawDefinitions({ eventId: event.eventId, drawIds: [drawId] }),
    );
    expect(observed.result.success).toEqual(true);
    expect(tournamentEngine.getEvent({ eventId: event.eventId }).event.timeItems?.length).toBeGreaterThan(0);
    expect(observed.payloads(MODIFY_EVENT)).toHaveLength(1);
    expect(observed.violations).toEqual([]);
  });
});
