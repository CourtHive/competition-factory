import { positionTargets } from '@Query/matchUp/positionTargets';
import { defined } from '@Tests/helpers/defined';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { describe, expect, it } from 'vitest';

// constants
import {
  CONTRADICTORY_POSITION_ACTION,
  DRAW_POSITION_ACTIVE,
  DRAW_POSITION_ASSIGNED,
  INVALID_MATCHUP,
} from '@Constants/errorConditionConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * THE DOMAIN THE PLANNER LEAVES TO THE WRITER. A public BYE placement whose walk meets an exit (a produced exit
 * where the position advances, or exit provenance on a matchUp it makes a BYE) keeps `assignDrawPositionBye`. Its
 * late refusals, each met by the writer after it has written, and each now asked first, of the record as it stands
 * (`byeWalkRefusal`), so a refused placement writes nothing:
 *
 *  1. the forward edge resolving to an earlier round (`refuseNonForwardAdvance`): a repeated matchUpId. Malformed only:
 *     with unique ids every same-structure winner target is a later round (the census below), so a record whose ids
 *     repeat is refused before the walk;
 *  2. a `positionTargets` error: a WINNER/LOSER link with no source round. Malformed only;
 *  3. a nested STRUCTURE_NOT_FOUND: a link to a structure the draw does not hold. Malformed only;
 *  4. a non-feed loser target with no seat (MISSING_DRAW_POSITION): such a target holds both seats from generation.
 *     Malformed only;
 *  5. the loser seat already ASSIGNED: reachable on a WELL-FORMED record, because a linked structure's seat can be
 *     filled through the public API before its feeder is decided. Witnessed here;
 *  6. the loser seat ACTIVE: never late on a well-formed record. A played loser seat makes the main matchUp feeding it
 *     an active dependency, so the placement's own seat is refused ACTIVE before anything is written (witnessed).
 */
useEngineCatch();

/** FMLC 8, nothing placed in main but a double walkover on 3 v 4, which produces an exit into main 2/1 */
function exitWalk() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, automated: false, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const [main, consolation] = drawDefinition.structures;
  const ids = defined(tournamentRecord.participants, 'participants').map(
    (participant: any) => participant.participantId,
  );
  for (const [drawPosition, participantId] of [
    [3, ids[0]],
    [4, ids[1]],
  ])
    expect(
      tournamentEngine.assignDrawPosition({ drawId, structureId: main.structureId, drawPosition, participantId })
        .success,
    ).toBe(true);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const contested = matchUps.find(
    (m: any) => m.structureId === main.structureId && m.roundNumber === 1 && m.drawPositions?.includes(3),
  );
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: contested.matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId,
  });
  expect(result.success).toBe(true);
  return { drawId, main, consolation, ids };
}

describe('the exit walk keeps the writer, and its one well-formed late refusal', () => {
  it('5. a loser seat filled through the public API is refused after the main writes', () => {
    const { drawId, main, consolation, ids } = exitWalk();
    const placed = tournamentEngine.assignDrawPosition({
      structureId: consolation.structureId,
      participantId: ids[5],
      drawPosition: 3,
      drawId,
    });
    expect(placed.success).toBe(true);
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });
    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
  });

  it('6. a loser seat played through the public API makes its feeder active, refused before any write', () => {
    const { drawId, main, consolation, ids } = exitWalk();
    const place = (drawPosition: number, participantId: string): any =>
      tournamentEngine.assignDrawPosition({
        drawId,
        structureId: consolation.structureId,
        drawPosition,
        participantId,
      });
    expect(place(3, ids[5]).success).toBe(true);
    // 8.0.0 refuses the second hand placement: main 1/1's loser would then have no seat in consolation 1/1. A record
    // stored earlier can hold both, so the seat is written directly
    expect(place(4, ids[6]).error).toEqual(CONTRADICTORY_POSITION_ACTION);
    const held = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const seatFour = held.events[0].drawDefinitions[0].structures
      .find((structure: any) => structure.structureId === consolation.structureId)
      .positionAssignments.find((assignment: any) => assignment.drawPosition === 4);
    delete seatFour.bye; // the placement replaced the BYE propagated there
    delete seatFour.byeFromPropagation;
    seatFour.participantId = ids[6];
    const pairing = held.events[0].drawDefinitions[0].structures
      .find((structure: any) => structure.structureId === consolation.structureId)
      .matchUps.find((matchUp: any) => matchUp.drawPositions?.includes(3) && matchUp.drawPositions?.includes(4));
    pairing.matchUpStatus = 'TO_BE_PLAYED'; // no longer a BYE
    expect(tournamentEngine.setState(held).success).toBe(true);
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const seat = matchUps.find((m: any) => m.structureId === consolation.structureId && m.drawPositions?.includes(3));
    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    // setup on the written record, scored under v2: differential compares v1's stamps on a seat v1 never wrote itself
    const mode = getOutcomePipeline();
    setOutcomePipeline(OUTCOME_PIPELINE_V2);
    expect(tournamentEngine.setMatchUpStatus({ matchUpId: seat.matchUpId, outcome, drawId }).success).toBe(true);
    setOutcomePipeline(mode);
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });
    expect(result.error).toEqual(DRAW_POSITION_ACTIVE);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
  });

  it('1. a repeated matchUpId past a resolved exit: the diagnostic, after the writes, on a malformed record only', () => {
    const { drawId, main, ids } = exitWalk();
    // a participant on 2 takes main 2/1's produced exit as they arrive past the BYE, and goes on to the final
    expect(
      tournamentEngine.assignDrawPosition({
        drawId,
        structureId: main.structureId,
        drawPosition: 2,
        participantId: ids[2],
      }).success,
    ).toBe(true);
    const record = tournamentEngine.getTournament().tournamentRecord;
    const structure = record.events[0].drawDefinitions[0].structures[0];
    const at = (roundNumber: number, roundPosition: number) =>
      structure.matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);
    // well-formed, the same placement is accepted
    tournamentEngine.setState(structuredClone(record));
    expect(
      tournamentEngine.assignDrawPositionBye({ drawId, structureId: main.structureId, drawPosition: 1 }).success,
    ).toBe(true);
    // malformed: the final repeats a first-round matchUpId
    at(3, 1).matchUpId = at(1, 2).matchUpId;
    tournamentEngine.setState(record);
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });
    expect(String(result.error)).toContain(INVALID_MATCHUP.code);
    expect(String(result.error)).toContain('not unique');
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
  });
});

describe('with unique matchUpIds no forward edge resolves backward', () => {
  it.each([
    'SINGLE_ELIMINATION',
    'FIRST_MATCH_LOSER_CONSOLATION',
    'FIRST_ROUND_LOSER_CONSOLATION',
    'FEED_IN_CHAMPIONSHIP',
    'FEED_IN_CHAMPIONSHIP_TO_SF',
    'MODIFIED_FEED_IN_CHAMPIONSHIP',
    'CURTIS_CONSOLATION',
    'COMPASS',
    'OLYMPIC',
    'DOUBLE_ELIMINATION',
    'PLAYOFF',
    'FEED_IN',
  ])('%s: every same-structure winner target is a later round', (drawType) => {
    for (const drawSize of [8, 16, 32]) {
      let generated: any;
      try {
        generated = mocksEngine.generateTournamentRecord({
          drawProfiles: [{ drawSize, drawType, automated: false }],
          setState: false,
          nonRandom: 1,
        });
      } catch {
        continue;
      }
      const drawDefinition = generated?.tournamentRecord?.events?.[0]?.drawDefinitions?.[0];
      if (!drawDefinition) continue;
      tournamentEngine.setState(generated.tournamentRecord);
      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: drawDefinition.drawId, inContext: true });
      const ids = new Set(matchUps.map((m: any) => m.matchUpId));
      expect(ids.size).toBe(matchUps.length);
      for (const matchUp of matchUps) {
        if (matchUp.collectionId) continue;
        const targets: any = positionTargets({
          matchUpId: matchUp.matchUpId,
          inContextDrawMatchUps: matchUps,
          drawDefinition,
        });
        expect(targets.error).toBeUndefined();
        const winner = targets.targetMatchUps?.winnerMatchUp;
        if (!winner || winner.structureId !== matchUp.structureId) continue;
        const resolved = matchUps.find((m: any) => m.matchUpId === winner.matchUpId);
        expect(resolved.roundNumber).toBeGreaterThan(matchUp.roundNumber);
      }
    }
  });
});
