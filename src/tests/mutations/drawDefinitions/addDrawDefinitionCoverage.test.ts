import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DELETE_DRAW_DEFINITIONS } from '@Constants/auditConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { AUDIT } from '@Constants/topicConstants';
import {
  DRAW_ID_EXISTS,
  INVALID_DRAW_DEFINITION,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_EVENT,
  SCORES_PRESENT,
} from '@Constants/errorConditionConstants';

describe('addDrawDefinition coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      setState: true,
    });
    const { events } = tournamentEngine.getEvents();
    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: undefined as any,
      eventId: events[0].eventId,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns DRAW_ID_EXISTS when adding duplicate without allowReplacement', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const existingDrawDefinition = event.drawDefinitions[0];

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
    });
    expect(result.error).toEqual(DRAW_ID_EXISTS);
  });

  it('allows replacement with allowReplacement flag', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const existingDrawDefinition = event.drawDefinitions[0];

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
      allowReplacement: true,
    });
    expect(result.success).toBe(true);
  });

  it('emits an AUDIT snapshot of the outgoing draw when replaced via allowReplacement', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const existingDrawDefinition = event.drawDefinitions[0];

    const audited: any[] = [];
    setSubscriptions({ subscriptions: { [AUDIT]: (notices) => audited.push(...notices) } });

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
      allowReplacement: true,
    });
    expect(result.success).toBe(true);

    // the outgoing (overwritten) draw is captured on the same contract deleteDrawDefinitions
    // uses, so the server AuditService records metadata.deletedDrawSnapshot and the draw is
    // recoverable via /audit/deleted-draws — closing the silent-data-loss gap on replace.
    expect(audited.length).toEqual(1);
    expect(audited[0].detail[0].action).toEqual(DELETE_DRAW_DEFINITIONS);
    const snapshot = audited[0].detail[0].payload.drawDefinitions[0];
    expect(snapshot.drawId).toEqual(existingDrawDefinition.drawId);
    expect(snapshot.structures?.length).toBeGreaterThan(0);

    setSubscriptions({ subscriptions: { [AUDIT]: true } }); // remove subscriber
  });

  it('does not emit an AUDIT snapshot when the replaced draw has no matchUps', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });
    const { events } = tournamentEngine.getEvents();
    const eventId = events[0].eventId;

    // add an empty (matchUp-less) draw, then replace it — the gate must keep this quiet
    expect(
      tournamentEngine.addDrawDefinition({ drawDefinition: newDrawDefinition({ drawId: 'empty-draw' }), eventId })
        .success,
    ).toBe(true);

    let auditCount = 0;
    setSubscriptions({ subscriptions: { [AUDIT]: () => (auditCount += 1) } });

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: newDrawDefinition({ drawId: 'empty-draw' }),
      allowReplacement: true,
      eventId,
    });
    expect(result.success).toBe(true);
    expect(auditCount).toEqual(0);

    setSubscriptions({ subscriptions: { [AUDIT]: true } }); // remove subscriber
  });

  it('refuses to replace a draw with scores present unless forced', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: SINGLE_ELIMINATION,
          drawSize: 4,
          outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-2 6-1', winningSide: 1 }],
        },
      ],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const existingDrawDefinition = event.drawDefinitions[0];

    const blocked = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
      allowReplacement: true,
    });
    expect(blocked.error).toEqual(SCORES_PRESENT);

    const forced = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
      allowReplacement: true,
      force: true,
    });
    expect(forced.success).toBe(true);
  });

  it('emits the AUDIT snapshot when force-replacing a scored draw', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: SINGLE_ELIMINATION,
          drawSize: 4,
          outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-2 6-1', winningSide: 1 }],
        },
      ],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const existingDrawDefinition = event.drawDefinitions[0];

    const audited: any[] = [];
    setSubscriptions({ subscriptions: { [AUDIT]: (notices) => audited.push(...notices) } });

    const forced = tournamentEngine.addDrawDefinition({
      drawDefinition: existingDrawDefinition,
      eventId: event.eventId,
      allowReplacement: true,
      force: true,
    });
    expect(forced.success).toBe(true);
    expect(audited.length).toEqual(1);
    expect(audited[0].detail[0].payload.drawDefinitions[0].drawId).toEqual(existingDrawDefinition.drawId);

    setSubscriptions({ subscriptions: { [AUDIT]: true } }); // remove subscriber
  });

  it('respects existingDrawCount mismatch', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const newDraw = newDrawDefinition({ drawId: 'new-draw-id' });

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: newDraw,
      eventId: event.eventId,
      existingDrawCount: 999, // doesn't match
    });
    expect(result.error).toBeDefined();
  });

  it('can add a new draw definition with modifyEventEntries', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const newDraw: DrawDefinition = newDrawDefinition({ drawId: 'brand-new-draw' });
    newDraw.entries = [];

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: newDraw,
      eventId: event.eventId,
      modifyEventEntries: true,
    });
    expect(result.success).toBe(true);
  });

  it('returns MISSING_EVENT when event is not provided', () => {
    const drawDefinition = newDrawDefinition();
    const result = addDrawDefinition({
      drawDefinition,
      event: undefined as any,
    });
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('initializes drawDefinitions array when event has none', () => {
    const drawDefinition = newDrawDefinition({ drawId: 'test-draw' });
    const event: any = { eventId: 'ev1', entries: [] };
    // event.drawDefinitions is undefined
    expect(event.drawDefinitions).toBeUndefined();

    const result = addDrawDefinition({ drawDefinition, event });
    expect(result.success).toBe(true);
    expect(Array.isArray(event.drawDefinitions)).toBe(true);
    expect(event.drawDefinitions.length).toEqual(1);
  });

  it('succeeds when existingDrawCount matches', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const newDraw = newDrawDefinition({ drawId: 'new-draw-matching' });

    // event has 1 existing draw, pass existingDrawCount=1
    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: newDraw,
      eventId: event.eventId,
      existingDrawCount: 1,
    });
    expect(result.success).toBe(true);
  });

  it('returns INVALID_VALUES when existingDrawCount does not match', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      setState: true,
    });

    const { events } = tournamentEngine.getEvents();
    const event = events[0];
    const newDraw = newDrawDefinition({ drawId: 'count-mismatch' });

    const result = tournamentEngine.addDrawDefinition({
      drawDefinition: newDraw,
      eventId: event.eventId,
      existingDrawCount: 5,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when source drawId in flight link does not exist', () => {
    const drawDefinition = newDrawDefinition({ drawId: 'target-draw' });
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [],
      extensions: [
        {
          name: FLIGHT_PROFILE,
          value: {
            flights: [{ drawId: 'target-draw', flightNumber: 1, drawEntries: [], drawName: 'Flight 1' }],
            links: [{ source: { drawId: 'non-existent-source' }, target: { drawId: 'target-draw' } }],
          },
        },
      ],
    };

    const result = addDrawDefinition({ drawDefinition, event });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when flight drawId conflicts with drawDefinition drawId', () => {
    const drawDefinition = newDrawDefinition({ drawId: 'my-draw-id' });
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [],
      extensions: [
        {
          name: FLIGHT_PROFILE,
          value: {
            flights: [
              {
                drawId: 'different-draw-id', // conflicts with drawDefinition.drawId
                flightNumber: 1,
                drawEntries: [],
                drawName: 'Flight 1',
              },
            ],
          },
        },
      ],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      flight: { flightNumber: 1 },
    });
    expect(result.error).toEqual(INVALID_DRAW_DEFINITION);
  });

  it('returns error when draw entries are not present in flight', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'flight-draw' });
    drawDefinition.entries = [
      { participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE },
      { participantId: 'p2', entryStatus: WILDCARD },
    ] as any;
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [
        { participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE },
        { participantId: 'p2', entryStatus: WILDCARD },
      ],
      extensions: [
        {
          name: FLIGHT_PROFILE,
          value: {
            flights: [
              {
                drawId: 'flight-draw',
                flightNumber: 1,
                drawEntries: [
                  { participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE },
                  // p2 missing from flight entries — mismatch
                ],
                drawName: 'Flight 1',
              },
            ],
          },
        },
      ],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      flight: { flightNumber: 1 },
    });
    expect(result.error).toEqual(INVALID_DRAW_DEFINITION);
  });

  it('returns error when checkEntryStatus detects mismatched entry statuses', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'status-check-draw' });
    drawDefinition.entries = [{ participantId: 'p1', entryStatus: WILDCARD }] as any;
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE }],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      checkEntryStatus: true,
    });
    expect(result.error).toEqual(INVALID_DRAW_DEFINITION);
  });

  it('succeeds when checkEntryStatus is true and statuses match', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'status-match-draw' });
    drawDefinition.entries = [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE }] as any;
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE }],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      checkEntryStatus: true,
    });
    expect(result.success).toBe(true);
  });

  it('modifyEventEntries updates event entry statuses to match draw entries', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'modify-entries-draw' });
    drawDefinition.entries = [{ participantId: 'p1', entryStatus: WILDCARD }] as any;
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE }],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      modifyEventEntries: true,
    });
    expect(result.success).toBe(true);
    expect(result.modifiedEventEntryStatusCount).toEqual(1);
    expect(event.entries[0].entryStatus).toEqual(WILDCARD);
  });

  it('modifyEventEntries does not modify entries with non-selected statuses', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'non-selected-draw' });
    // WITHDRAWN is not in STRUCTURE_SELECTED_STATUSES
    drawDefinition.entries = [{ participantId: 'p1', entryStatus: 'WITHDRAWN' }] as any;
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE }],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      modifyEventEntries: true,
    });
    expect(result.success).toBe(true);
    expect(result.modifiedEventEntryStatusCount).toEqual(0);
    // event entry remains unchanged
    expect(event.entries[0].entryStatus).toEqual(DIRECT_ACCEPTANCE);
  });

  it('replacement with suppressNotifications skips notification calls', () => {
    const drawId = 'suppress-draw';
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId });
    const existingDraw: DrawDefinition = newDrawDefinition({ drawId });
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [existingDraw],
      entries: [],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      allowReplacement: true,
      suppressNotifications: true,
    });
    expect(result.success).toBe(true);
    // With suppressNotifications, drawDefinitions should NOT be replaced via the notification path
    // The existing draw remains because replacement logic is inside the !suppressNotifications block
    expect(event.drawDefinitions.length).toEqual(1);
  });

  it('new draw with suppressNotifications skips notification calls', () => {
    const drawDefinition = newDrawDefinition({ drawId: 'silent-new-draw' });
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      suppressNotifications: true,
    });
    expect(result.success).toBe(true);
    expect(event.drawDefinitions.length).toEqual(1);
  });

  it('uses flight flightNumber as drawOrder when not conflicting', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'flight-order-draw' });
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [],
      extensions: [
        {
          name: FLIGHT_PROFILE,
          value: {
            flights: [
              {
                drawId: 'flight-order-draw',
                flightNumber: 3,
                drawEntries: [],
                drawName: 'Flight 3',
              },
            ],
          },
        },
      ],
    };

    const result = addDrawDefinition({ drawDefinition, event });
    expect(result.success).toBe(true);
    expect(drawDefinition.drawOrder).toEqual(3);
  });

  it('assigns new drawOrder when flight flightNumber conflicts with existing drawOrder', () => {
    const existingDraw: DrawDefinition = newDrawDefinition({ drawId: 'existing' });
    Object.assign(existingDraw, { drawOrder: 2 });

    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'conflict-order-draw' });
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [existingDraw],
      entries: [],
      extensions: [
        {
          name: FLIGHT_PROFILE,
          value: {
            flights: [
              {
                drawId: 'conflict-order-draw',
                flightNumber: 2, // conflicts with existingDraw.drawOrder
                drawEntries: [],
                drawName: 'Flight conflict',
              },
            ],
          },
        },
      ],
    };

    const result = addDrawDefinition({ drawDefinition, event });
    expect(result.success).toBe(true);
    // drawOrder should be max(0, 2, 2) + 1 = 3
    expect(drawDefinition.drawOrder).toEqual(3);
  });

  it('creates a manuallyAdded flight when no matching flight exists', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'manual-draw' });
    drawDefinition.drawName = 'Manual Draw';
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [],
    };

    const result = addDrawDefinition({ drawDefinition, event });
    expect(result.success).toBe(true);

    const flightProfile = firstClassOrExtension({ element: event, attribute: 'flightProfile', name: FLIGHT_PROFILE });
    expect(flightProfile).toBeDefined();
    const flight = flightProfile.flights.find((f: any) => f.drawId === 'manual-draw');
    expect(flight).toBeDefined();
    expect(flight.manuallyAdded).toBe(true);
    expect(flight.drawName).toEqual('Manual Draw');
  });

  it('updates flight drawName when flight exists in profile', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'name-update-draw' });
    drawDefinition.drawName = 'Updated Name';
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [],
      extensions: [
        {
          name: FLIGHT_PROFILE,
          value: {
            flights: [
              {
                drawId: 'name-update-draw',
                flightNumber: 1,
                drawEntries: [],
                drawName: 'Original Name',
              },
            ],
          },
        },
      ],
    };

    const result = addDrawDefinition({ drawDefinition, event });
    expect(result.success).toBe(true);

    const flightProfile = firstClassOrExtension({ element: event, attribute: 'flightProfile', name: FLIGHT_PROFILE });
    const flight = flightProfile.flights.find((f: any) => f.drawId === 'name-update-draw');
    expect(flight.drawName).toEqual('Updated Name');
  });

  it('replacement replaces drawDefinition in-place and sends notifications', () => {
    const drawId = 'replace-draw';
    const existingDraw: DrawDefinition = newDrawDefinition({ drawId });
    existingDraw.drawName = 'Old';
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId });
    drawDefinition.drawName = 'New';

    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [existingDraw],
      entries: [],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      allowReplacement: true,
    });
    expect(result.success).toBe(true);
    expect(event.drawDefinitions.length).toEqual(1);
    expect(event.drawDefinitions[0].drawName).toEqual('New');
  });

  it('checkEntryStatus with entryStage matching', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'stage-check-draw' });
    drawDefinition.entries = [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE, entryStage: 'MAIN' }] as any;
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE, entryStage: 'MAIN' }],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      checkEntryStatus: true,
    });
    expect(result.success).toBe(true);
  });

  it('checkEntryStatus returns error when entryStage does not match', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition({ drawId: 'stage-mismatch-draw' });
    drawDefinition.entries = [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE, entryStage: 'QUALIFYING' }] as any;
    const event: any = {
      eventId: 'ev1',
      drawDefinitions: [],
      entries: [{ participantId: 'p1', entryStatus: DIRECT_ACCEPTANCE, entryStage: 'MAIN' }],
    };

    const result = addDrawDefinition({
      drawDefinition,
      event,
      checkEntryStatus: true,
    });
    expect(result.error).toEqual(INVALID_DRAW_DEFINITION);
  });
});
