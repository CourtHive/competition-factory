import { INTERNAL_PARAMS } from '@Constants/internalParamsConstants';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';
import { describe, expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DRAW_POSITION_ASSIGNED, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * PUBLIC METHODS TAKE IDS, NOT RESOLVED STATE (internalParams.ts). A param the factory's own callers hand a method, to
 * supply state it would resolve itself or to say a check was made, is refused with INVALID_VALUES when an engine call
 * names it: before anything is read or written, its context naming the keys. The factory's own paths, which call the
 * functions directly, still pass them.
 */
useEngineCatch();

const stored = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);

function generated() {
  const { tournamentRecord, drawIds, venueIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, automated: false, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    venueProfiles: [{ courtsCount: 2 }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord, false);
  const drawId = drawIds[0];
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const courtId = tournamentEngine.getVenuesAndCourts().courts[0].courtId;
  return { tournamentRecord, drawId, drawDefinition, event, venueId: venueIds[0], courtId };
}

/** FMLC 8: a double walkover on 3 v 4 produces an exit into main 2/1; consolation 3, main 1/1's loser seat, is filled */
function exitWalk() {
  const { tournamentRecord, drawId, drawDefinition } = generated();
  const [main, consolation] = drawDefinition.structures;
  const ids = tournamentRecord.participants.map((participant: any) => participant.participantId);
  const assign = (structureId: string, drawPosition: number, participantId: string) =>
    expect(tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition, participantId }).success).toBe(
      true,
    );
  assign(main.structureId, 3, ids[0]);
  assign(main.structureId, 4, ids[1]);
  const contested = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find(
      (m: any) => m.structureId === main.structureId && m.roundNumber === 1 && m.drawPositions?.includes(3),
    );
  const walkover = { matchUpId: contested.matchUpId, outcome: { matchUpStatus: DOUBLE_WALKOVER }, drawId };
  expect(tournamentEngine.setMatchUpStatus(walkover).success).toBe(true);
  assign(consolation.structureId, 3, ids[5]);
  return { drawId, main, tournamentRecord };
}

describe('a BYE placement through the public call writes nothing when refused', () => {
  it('the FMLC 8 reproduction: refused downstream, the record as it was', () => {
    const { drawId, main } = exitWalk();
    const before = stored();
    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });
    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(stored()).toBe(before);
    const queued: any = tournamentEngine.executionQueue(
      [{ method: 'assignDrawPositionBye', params: { drawId, structureId: main.structureId, drawPosition: 1 } }],
      true,
    );
    expect(queued.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(stored()).toBe(before);
  });

  it.each(INTERNAL_PARAMS.assignDrawPositionBye)('the writer param %s is refused, the record as it was', (key) => {
    const { drawId, main, tournamentRecord } = exitWalk();
    const draw = tournamentRecord.events[0].drawDefinitions[0];
    const values: Record<string, unknown> = {
      structure: draw.structures[0],
      matchUpsMap: getMatchUpsMap({ drawDefinition: draw }),
      inContextDrawMatchUps: tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps,
      loserMatchUp: draw.structures[0].matchUps[0],
      byeFromPropagation: true,
      drawPositionsInactive: true,
      activityAsked: true,
    };
    const before = stored();
    const params = { drawId, structureId: main.structureId, drawPosition: 1, [key]: values[key] };
    const result: any = tournamentEngine.assignDrawPositionBye(params);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.params).toEqual([key]);
    expect(stored()).toBe(before);
    // the governor function itself refuses them too: the engine's own placements call the writer, not this
    const direct: any = (governors.drawsGovernor as any).assignDrawPositionBye({
      ...params,
      drawDefinition: draw,
      tournamentRecord,
    });
    expect(direct.error).toEqual(INVALID_VALUES);
    expect(stored()).toBe(before);
  });
});

describe('every other method refuses its internal params at the engine boundary', () => {
  const cases = Object.entries(INTERNAL_PARAMS).filter(([method]) => method !== 'assignDrawPositionBye');
  it.each(cases.flatMap(([method, keys]) => keys.map((key) => [method, key] as const)))('%s: %s', (method, key) => {
    const { drawId, venueId, courtId, event } = generated();
    const matchUpId = tournamentEngine.allDrawMatchUps({ drawId }).matchUps[0].matchUpId;
    const params: Record<string, Record<string, unknown>> = {
      addMatchUpScheduleItems: { drawId, matchUpId, schedule: { scheduledDate: '2030-01-01' } },
      addMatchUpScheduledTime: { drawId, matchUpId, scheduledTime: '10:00' },
      addMatchUpScheduledDate: { drawId, matchUpId, scheduledDate: '2030-01-01' },
      bulkScheduleTournamentMatchUps: { matchUpIds: [matchUpId], schedule: { scheduledDate: '2030-01-01' } },
      addMatchUpStartTime: { drawId, matchUpId, startTime: '10:00' },
      addMatchUpEndTime: { drawId, matchUpId, endTime: '11:00' },
      modifyCourt: { courtId, modifications: { courtName: 'X' } },
      modifyCourtAvailability: { courtId, dateAvailability: [] },
      addEvent: { event: { ...event, eventId: 'new-event', drawDefinitions: [] } },
      automatedPositioning: {
        drawId,
        structureId: tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId,
      },
    };
    expect(params[method], `a fixture for ${method}`).toBeDefined();
    const values: Record<string, unknown> = { matchUpsMap: { drawMatchUps: [], mappedMatchUps: {} } };
    const value = values[key] ?? (key.endsWith('MatchUps') ? [] : true);
    const before = stored();
    const called = { ...params[method], [key]: value };
    for (const result of [
      (tournamentEngine as any)[method](called),
      tournamentEngine.executionQueue([{ method, params: called }]),
    ] as any[]) {
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.context).toEqual({ methodName: method, params: [key] });
    }
    expect(stored()).toBe(before);
    expect(venueId).toBeDefined();
  });
});

describe('the factory own paths still pass them', () => {
  it('a propagated BYE, bulk scheduling and generated events', () => {
    // an exit propagated past a BYE places one through the writer (byeFromPropagation)
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, participantsCount: 14, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      completeAllMatchUps: false,
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);
    const first = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { roundNumbers: [1] } })
      .matchUps.find((m: any) => m.stage === 'MAIN' && m.readyToScore);
    const walkover = { matchUpStatus: DOUBLE_WALKOVER };
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId: first.matchUpId, outcome: walkover }).success).toBe(
      true,
    );
    // scheduling: the bulk path hands its writers playedOrderChecked
    const matchUpIds = tournamentEngine.allTournamentMatchUps().matchUps.map((m: any) => m.matchUpId);
    const scheduledDate = tournamentRecord.startDate;
    const scheduled: any = tournamentEngine.bulkScheduleMatchUps({ matchUpIds, schedule: { scheduledDate } });
    expect(scheduled.error).toBeUndefined();
    expect(
      tournamentEngine.allTournamentMatchUps().matchUps.some((m: any) => m.schedule?.scheduledDate === scheduledDate),
    ).toBe(true);
    // positioning: generation positions through automatedPositioning with its own map and hydration
    const generatedRR = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: ROUND_ROBIN }],
      nonRandom: 2,
    });
    expect(generatedRR.drawIds).toHaveLength(1);
  });
});
