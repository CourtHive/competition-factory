import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { APPLIED_POLICIES, DRAW_DELETIONS } from '@Constants/extensionConstants';
import { AUDIT, DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

describe('deleteDrawDefinitions - uncovered branch coverage', () => {
  it('returns success with info when event has no drawDefinitions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'No Draws' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    result = tournamentEngine.deleteDrawDefinitions({ eventId, drawIds: ['nonexistent'] });
    expect(result.success).toEqual(true);
  });

  it('returns success when drawIds do not match any event draws', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: ['nonexistent-draw-id'],
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('deletes all drawDefinitions when drawIds is empty array', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Empty drawIds means "delete all"
    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [],
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ eventId });
    expect(event.drawDefinitions.length).toEqual(0);
  });

  it('records draw deletion telemetry when no AUDIT subscription', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Ensure no AUDIT subscription is active
    setSubscriptions({ subscriptions: {} });

    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      eventId,
    });
    expect(result.success).toEqual(true);

    // Should have added a DRAW_DELETIONS extension instead of using AUDIT topic
    const { event } = tournamentEngine.getEvent({ eventId });
    const deletionsExtension = event.extensions?.find((ext) => ext.name === DRAW_DELETIONS);
    expect(deletionsExtension).toBeDefined();
    expect(Array.isArray(deletionsExtension.value)).toEqual(true);
  });

  it('respects audit policy to suppress draw deletion telemetry', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Set up a policy that suppresses draw deletion auditing
    const policyDefinitions = {
      [POLICY_TYPE_SCORING]: {},
      audit: { [DRAW_DELETIONS]: false },
    };
    const extension = { name: APPLIED_POLICIES, value: policyDefinitions };
    tournamentEngine.addTournamentExtension({ extension });

    // No AUDIT subscription
    setSubscriptions({ subscriptions: {} });

    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      eventId,
    });
    expect(result.success).toEqual(true);

    // With audit suppressed, no extension should be added
    const { event } = tournamentEngine.getEvent({ eventId });
    const deletionsExtension = event.extensions?.find((ext) => ext.name === DRAW_DELETIONS);
    expect(deletionsExtension).toBeUndefined();
  });

  it('handles deletion of draws with scores when force is true', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    // Without force, should error
    let result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      eventId,
    });
    expect(result.error).toEqual(SCORES_PRESENT);

    // With force, should succeed
    result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      eventId,
      force: true,
    });
    expect(result.success).toEqual(true);
  });

  it('handles deletion of published draws and republishes', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Publish the event first
    let result = tournamentEngine.publishEvent({ eventId });
    expect(result.success).toEqual(true);

    // Delete the draw — should handle publishedDrawsDeleted path
    result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles deletion with autoPublish disabled', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Publish the event first
    let result = tournamentEngine.publishEvent({ eventId });
    expect(result.success).toEqual(true);

    // Delete with autoPublish false
    result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      autoPublish: false,
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles draws with qualifying structures', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ qualifyingPositions: 2, drawSize: 4 }] }],
        },
      ],
      setState: true,
    });

    // No AUDIT subscription
    setSubscriptions({ subscriptions: {} });

    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ eventId });
    expect(event.drawDefinitions.length).toEqual(0);

    // Verify deletion telemetry was recorded
    const deletionsExtension = event.extensions?.find((ext) => ext.name === DRAW_DELETIONS);
    expect(deletionsExtension).toBeDefined();
    expect(Array.isArray(deletionsExtension.value)).toEqual(true);
    expect(deletionsExtension.value.length).toBeGreaterThan(0);
    // The detail should include deletedDrawsDetail with qualifying info
    const detail = deletionsExtension.value[0];
    expect(detail.deletedDrawsDetail).toBeDefined();
    const drawDetail = detail.deletedDrawsDetail.find((d) => d.drawId === drawId);
    expect(drawDetail).toBeDefined();
    expect(drawDetail.qualifyingPositionAssignments).toBeDefined();
  });

  it('handles multiple draws — deletes only specified ones', () => {
    const { drawIds, eventIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 4, drawId: 'draw1' },
        { drawSize: 4, drawId: 'draw2', eventId: 'e1' },
      ],
      setState: true,
    });

    // Each draw may be in different events, find the right one
    const eventId = eventIds[0];

    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawIds[0]],
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles deletion with AUDIT subscription and matchUp notifications', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    let deletedMatchUpIds: string[] = [];
    const subscriptions = {
      [AUDIT]: () => undefined,
      [DELETED_MATCHUP_IDS]: (notices) => {
        deletedMatchUpIds = notices[0]?.matchUpIds ?? [];
      },
    };
    setSubscriptions({ subscriptions });

    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
      eventId,
    });
    expect(result.success).toEqual(true);
    // 8-player single elimination = 7 matchUps
    expect(deletedMatchUpIds.length).toEqual(7);
  });

  it('handles finding event by drawId when eventId not provided', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // No AUDIT subscription
    setSubscriptions({ subscriptions: {} });

    // Provide only drawId, no eventId — event should be found via drawId
    const result = tournamentEngine.deleteDrawDefinitions({
      drawIds: [drawId],
    });
    expect(result.success).toEqual(true);
  });
});
