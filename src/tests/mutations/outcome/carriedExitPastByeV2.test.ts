import { MATRIX_EXTENSION_CELLS, runMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome';
import { setOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { BYE, COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  CONSOLATION,
  MAIN,
} from '@Constants/drawDefinitionConstants';

/**
 * S2c: an exit that meets a BYE, carried (exit-propagation RULE 1) or produced by a double exit, planned by
 * v2 and compared with v1.
 *
 * Not a corpus scenario: every draw with a BYE stores a trailing hole in a second-round `drawPositions`
 * (`[1, undefined]`, serialised `[1, null]`), which fails tournament.schema.json, so the corpus cannot
 * hold its starting record (Mentat punch list P37, half 2).
 */
const DRAW_ID = 'past-a-bye';

afterEach(() => setOutcomePipeline());

const at = (stage: string, roundNumber: number, roundPosition: number): any =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.stage === stage && matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition,
    );

function setup() {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  resetDifferentialTally();
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, participantsCount: 7 }],
    setState: true,
  });
}

const tally = (key: string) => getDifferentialTally()[key] ?? { compared: 0, deferred: 0 };

it('sends a carried exit on past a BYE: the holder stays a BYE and the next round holds the exit', () => {
  setup();
  // CONTROL: the loser of MAIN 1/2 is fed opposite a BYE
  expect(at(CONSOLATION, 1, 1).sides.some((side: any) => side.bye)).toEqual(true);

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    matchUpId: at(MAIN, 1, 2).matchUpId,
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);

  const holder = at(CONSOLATION, 1, 1);
  expect(holder.matchUpStatus).toEqual(BYE);
  expect(holder.winningSide).toBeUndefined();
  const onward = at(CONSOLATION, 2, 1);
  const loserSide = onward.sides.find((side: any) => side.participantId)?.sideNumber;
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  expect(onward.winningSide).toEqual(3 - loserSide);

  // and v2 planned it and compared it, rather than deferring
  expect(tally('winner:loser-exit-past-bye').compared).toEqual(1);
});

it('a completed result relabelled as a WALKOVER carries nothing to the loser already directed (pending CA)', () => {
  setup();
  const matchUpId = at(MAIN, 1, 3).matchUpId;
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome,
    drawId: DRAW_ID,
    matchUpId,
  });
  expect(result.success).toEqual(true);
  expect(at(MAIN, 1, 3).matchUpStatus).toEqual(COMPLETED);
  const fed = at(CONSOLATION, 1, 2);
  expect(fed.matchUpStatus).toEqual(TO_BE_PLAYED);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    propagateExitStatus: true,
    drawId: DRAW_ID,
    matchUpId,
  });
  expect(result.success).toEqual(true);
  expect(at(MAIN, 1, 3).matchUpStatus).toEqual(WALKOVER);
  // v1 today: the consolation matchUp the loser was already fed into is untouched
  expect(at(CONSOLATION, 1, 2).matchUpStatus).toEqual(TO_BE_PLAYED);
  // v2 plans the same and marks the call, so the open question stays visible
  expect(tally('winner:relabel-exit').deferred).toEqual(1);
});

it('sends an exit a double exit produced on past a BYE, and v2 compares it', () => {
  // the extension matrix's FEED_IN_CHAMPIONSHIP_TO_R16 16/15 DOUBLE_WALKOVER cell, where a produced exit
  // meets a BYE at Consolation 2/1; no small draw reaches this shape in its first two rounds
  const cell = MATRIX_EXTENSION_CELLS.find(
    (candidate) =>
      candidate.drawType === FEED_IN_CHAMPIONSHIP_TO_R16 &&
      candidate.participantsCount === 15 &&
      candidate.exitStatus === DOUBLE_WALKOVER &&
      candidate.propagateExitStatus,
  );
  expect(cell).toBeDefined();
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  resetDifferentialTally();
  expect(runMatrixCell(cell as any, 'produced-past-a-bye')).toBeDefined();

  const compared = Object.entries(getDifferentialTally())
    .filter(([key]) => key.includes(':produced-past-bye-'))
    .reduce((sum, [, count]) => sum + count.compared, 0);
  expect(compared).toBeGreaterThan(0);
});
