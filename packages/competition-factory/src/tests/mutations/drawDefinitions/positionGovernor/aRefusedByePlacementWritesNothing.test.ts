import { setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import { DRAW_POSITION_ASSIGNED } from '@Constants/errorConditionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Tests/testHarness/outcomeModes';

/**
 * A refused BYE placement changes nothing, even one refused only downstream. A public placement whose walk meets an
 * exit is placed by the writer, which met a loser seat already filled only after it had written the BYE, the matchUp
 * it lands in and the advance before that seat. That refusal is now found first, of the record as it stands, and the
 * writer is not run: the record reads as it did, the objects in it are the same objects, nothing in it is written at
 * all (a frozen record refuses the same way), and no notice is delivered. A placement the writer accepts on the same
 * path is unchanged.
 *
 * The placement does not go through the outcome pipeline, so every mode gives the same answer; each case sets its own.
 */
useEngineCatch();

afterEach(() => {
  // the frozen copies below are the engine's own while a case runs: none is left loaded for the next file
  tournamentEngine.reset();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline();
});

const MODES = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const;

/** every matchUp and position-assignment notice delivered from here on */
function delivered() {
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (payload: any[]) => notices.push(...payload.map(() => MODIFY_MATCHUP)),
      [MODIFY_POSITION_ASSIGNMENTS]: (payload: any[]) =>
        notices.push(...payload.map(() => MODIFY_POSITION_ASSIGNMENTS)),
    },
  });
  return notices;
}

/**
 * every object under `value`, frozen: a write to any of them throws. Only ever handed a private `structuredClone`: a
 * generated record can share objects with the mocks and constants other files read, and frozen they would stay frozen
 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** FMLC 8 with a double walkover on 3 v 4, which produces an exit into main 2/1: a BYE on 1 walks through it */
function exitWalk({ fillLoserSeat }: { fillLoserSeat: boolean }) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, automated: false, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    nonRandom: 1,
  });
  // the engine works on this record's own objects, so what it holds before the call can be compared after
  tournamentEngine.setState(tournamentRecord, false);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
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
  expect(
    tournamentEngine.setMatchUpStatus({
      matchUpId: contested.matchUpId,
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      drawId,
    }).success,
  ).toBe(true);
  // the seat main 1/1's loser is sent to, filled before its feeder is decided
  if (fillLoserSeat) assign(consolation.structureId, 3, ids[5]);
  return { tournamentRecord, drawId, main };
}

describe('a BYE placement refused past its first write leaves the record as it was', () => {
  it.each(MODES)('%s: a loser seat already filled downstream', (mode) => {
    setOutcomePipeline(mode);
    const { tournamentRecord, drawId, main } = exitWalk({ fillLoserSeat: true });
    const draw = tournamentRecord.events[0].drawDefinitions[0];
    const held = { structure: draw.structures[0], matchUps: [...draw.structures[0].matchUps] };
    const before = JSON.stringify(tournamentRecord);
    const notices = delivered();

    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });

    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
    expect(JSON.stringify(tournamentRecord)).toBe(before);
    expect(draw.structures[0]).toBe(held.structure);
    held.matchUps.forEach((matchUp, at) => expect(draw.structures[0].matchUps[at]).toBe(matchUp));
    expect(notices).toEqual([]);
  });

  it.each(MODES)('%s: through assignDrawPosition with bye: true', (mode) => {
    setOutcomePipeline(mode);
    const { tournamentRecord, drawId, main } = exitWalk({ fillLoserSeat: true });
    const before = JSON.stringify(tournamentRecord);
    const notices = delivered();

    const result: any = tournamentEngine.assignDrawPosition({
      structureId: main.structureId,
      drawPosition: 1,
      bye: true,
      drawId,
    });

    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(JSON.stringify(tournamentRecord)).toBe(before);
    expect(notices).toEqual([]);
  });

  it.each(MODES)('%s: with the seat empty the same placement is accepted, writes and announces', (mode) => {
    setOutcomePipeline(mode);
    const { tournamentRecord, drawId, main } = exitWalk({ fillLoserSeat: false });
    const before = JSON.stringify(tournamentRecord);
    const notices = delivered();

    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });

    expect(result.success).toBe(true);
    expect(JSON.stringify(tournamentRecord)).not.toBe(before);
    const seat = tournamentRecord.events[0].drawDefinitions[0].structures[0].positionAssignments.find(
      (assignment: any) => assignment.drawPosition === 1,
    );
    expect(seat.bye).toBe(true);
    expect(notices).toContain(MODIFY_MATCHUP);
    expect(notices).toContain(MODIFY_POSITION_ASSIGNMENTS);
  });

  it.each(MODES)('%s: the stored record is never written, so a frozen one refuses the same way', (mode) => {
    setOutcomePipeline(mode);
    const { tournamentRecord, drawId, main } = exitWalk({ fillLoserSeat: true });
    const before = JSON.stringify(tournamentRecord);
    const frozen = deepFreeze(structuredClone(tournamentRecord));
    tournamentEngine.setState(frozen, false);

    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });

    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it.each(MODES)('%s: control: a frozen record cannot take the accepted placement', (mode) => {
    setOutcomePipeline(mode);
    const { tournamentRecord, drawId, main } = exitWalk({ fillLoserSeat: false });
    tournamentEngine.setState(deepFreeze(structuredClone(tournamentRecord)), false);

    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });

    expect(result.success).not.toBe(true);
    expect(String(result.error?.message ?? result.error)).toMatch(/read only|read-only|frozen|not extensible/i);
  });

  it.each(MODES)('%s: COMPASS 32/31, a BYE at West 8 after exits on East', (mode) => {
    setOutcomePipeline(mode);
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount: 31, drawType: COMPASS, drawSize: 32, drawId: 'c' }],
      nonRandom: 6258,
      setState: true,
    });
    const at = (key: string) => {
      const [structureName, roundNumber, roundPosition] = key.split('|');
      return tournamentEngine
        .allDrawMatchUps({ drawId: 'c', inContext: true })
        .matchUps.find(
          (m: any) =>
            m.structureName === structureName &&
            m.roundNumber === Number(roundNumber) &&
            m.roundPosition === Number(roundPosition),
        );
    };
    const set = (winningSide: 1 | 2) => ({
      sets: [
        { setNumber: 1, side1Score: winningSide === 1 ? 6 : 2, side2Score: winningSide === 1 ? 2 : 6, winningSide },
      ],
    });
    const steps: [string, any][] = [
      ['East|1|13', { matchUpStatus: 'WALKOVER', winningSide: 2, sideStatusCodes: { 1: 'W1' } }],
      ['East|1|4', { matchUpStatus: 'DOUBLE_DEFAULT', sideStatusCodes: { 1: 'DM', 2: 'DM' } }],
      ['West|1|7', { winningSide: 1, score: set(1) }],
      ['East|1|13', { winningSide: 2, score: set(2) }],
      ['East|1|5', { matchUpStatus: 'RETIRED', winningSide: 2, sideStatusCodes: { 1: 'RJ' }, score: set(2) }],
      ['East|1|6', { matchUpStatus: 'DEFAULTED', winningSide: 2, sideStatusCodes: { 1: 'DM' } }],
      ['East|2|2', { matchUpStatus: 'DOUBLE_DEFAULT', sideStatusCodes: { 1: 'DM', 2: 'DM' } }],
      ['East|1|2', { matchUpStatus: 'DOUBLE_WALKOVER', sideStatusCodes: { 1: 'WOWO', 2: 'WOWO' } }],
    ];
    for (const [key, outcome] of steps)
      tournamentEngine.setMatchUpStatus({
        matchUpId: at(key).matchUpId,
        propagateExitStatus: true,
        drawId: 'c',
        outcome,
      });
    const west = tournamentEngine
      .getEvent({ drawId: 'c' })
      .drawDefinition.structures.find((structure: any) => structure.structureName === 'West');
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const notices = delivered();

    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId: 'c',
      structureId: west.structureId,
      drawPosition: 8,
    });

    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
    expect(notices).toEqual([]);
  });
});
