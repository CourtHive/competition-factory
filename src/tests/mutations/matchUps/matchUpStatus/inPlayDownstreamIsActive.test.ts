import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { AWAITING_RESULT, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  CANNOT_CHANGE_WINNING_SIDE,
  INCOMPATIBLE_MATCHUP_STATUS,
  NO_VALID_ACTIONS,
} from '@Constants/errorConditionConstants';

/**
 * A MATCHUP IN PLAY DOWNSTREAM IS ACTIVE (P57).
 *
 * CA, 2026-10-18: *"downstream matchUps e.g. "the match it feeds" should be considered active and a source matchUp
 * (a matchUp earler in the dependency chain) should not be able to be re-scored as unfinished! a downstream matchUp
 * AWAITING_RESULT should be considered an active matchUp also"*
 *
 * Every result test in `isActiveDownstream` opened with `winningSide`, so a final being PLAYED read as inactive. A
 * completed semifinal could then be re-scored as unfinished (IN_PROGRESS, a score with no winner, a clear) through
 * `noDownStreamDependencies`, which took back the participant it had advanced and wiped the final's live score:
 * the final was left TO_BE_PLAYED, scoreless, with side 1 empty.
 *
 * The parts of the ruling are asserted separately:
 *  (a) an IN_PROGRESS downstream with a score blocks re-scoring the source as unfinished, and the draw is untouched;
 *  (b) a downstream AWAITING_RESULT does the same;
 *  (c) a downstream holding only a score, with no status of play, does the same;
 *  (d) control: with nothing in play downstream, the source can still be re-scored as unfinished.
 * The refusals are the ones a COMPLETED downstream already gets (`checkDownstreamCompatibility`,
 * `resolveAndApplyOutcome`, `winningSideWithDownstreamDependencies`).
 */

const drawId = 'in-play-downstream';
const score = (side1: number, side2: number) => ({
  scoreStringSide1: `${side1}-${side2}`,
  scoreStringSide2: `${side2}-${side1}`,
  sets: [{ setNumber: 1, side1Score: side1, side2Score: side2 }],
});

/** `createdAt`/`updatedAt` excluded — a timestamp bump is not the mutation under test. */
function drawState(): string {
  const strip = (value: any): any => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object') {
      const result: any = {};
      for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
        if (key === 'createdAt' || key === 'updatedAt') continue;
        result[key] = strip(value[key]);
      }
      return result;
    }
    return value;
  };
  return JSON.stringify(strip(tournamentEngine.getEvent({ drawId })?.drawDefinition ?? null));
}

/** SINGLE_ELIMINATION 4: both semifinals completed, then the final put into the given state */
function semifinalsCompleted(finalOutcome?: any) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
    setState: true,
  });
  for (const matchUpId of ['m-1-1', 'm-1-2']) {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    const result = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
    expect(result.success).toEqual(true);
  }
  if (finalOutcome) {
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: 'm-2-1', outcome: finalOutcome, drawId });
    expect(result.success).toEqual(true);
  }
}

/** the final as it stands: its status, score and both participants */
function final() {
  const matchUp = tournamentEngine.findMatchUp({ matchUpId: 'm-2-1', inContext: true, drawId }).matchUp;
  return {
    participantIds: matchUp.sides.map((side: any) => side.participantId),
    scoreString: matchUp.score?.scoreStringSide1,
    matchUpStatus: matchUp.matchUpStatus,
  };
}

/** the re-scores of the completed semifinal `m-1-1` that leave it unfinished, and the refusal each meets */
const unfinishedReScores: [string, any, any][] = [
  [
    'IN_PROGRESS with a score',
    { outcome: { matchUpStatus: IN_PROGRESS, score: score(4, 3) } },
    INCOMPATIBLE_MATCHUP_STATUS,
  ],
  [
    'a score with no status and no winner',
    { outcome: { score: score(4, 3) }, disableScoreValidation: true },
    NO_VALID_ACTIONS,
  ],
  ['AWAITING_RESULT', { outcome: { matchUpStatus: AWAITING_RESULT } }, INCOMPATIBLE_MATCHUP_STATUS],
  [
    'a clear',
    { outcome: { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '', sets: [] } } },
    INCOMPATIBLE_MATCHUP_STATUS,
  ],
];

/** a winner change would also take back the participant the semifinal advanced */
const winnerChange = {
  outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 2 }).outcome,
};

function expectRefusedAndUntouched(params: any, error: any) {
  const before = drawState();
  const finalBefore = final();
  const result = tournamentEngine.setMatchUpStatus({ matchUpId: 'm-1-1', drawId, ...params });
  expect(result.success).toBeUndefined();
  expect(result.error?.code).toEqual(error.code);
  expect(final()).toEqual(finalBefore);
  expect(drawState()).toEqual(before);
}

describe('(a) a downstream IN_PROGRESS with a score is active', () => {
  it.each(unfinishedReScores)('refuses re-scoring the source as unfinished: %s', (_, params, error) => {
    semifinalsCompleted({ matchUpStatus: IN_PROGRESS, score: score(3, 2) });
    expect(final().matchUpStatus).toEqual(IN_PROGRESS);
    expect(final().scoreString).toEqual('3-2');
    expectRefusedAndUntouched(params, error);
  });

  it('refuses a winner change of the source', () => {
    semifinalsCompleted({ matchUpStatus: IN_PROGRESS, score: score(3, 2) });
    expectRefusedAndUntouched(winnerChange, CANNOT_CHANGE_WINNING_SIDE);
  });
});

describe('(b) a downstream AWAITING_RESULT is active', () => {
  it.each(unfinishedReScores)('refuses re-scoring the source as unfinished: %s', (_, params, error) => {
    semifinalsCompleted({ matchUpStatus: AWAITING_RESULT });
    expect(final().matchUpStatus).toEqual(AWAITING_RESULT);
    expect(final().scoreString).toBeUndefined();
    expectRefusedAndUntouched(params, error);
  });

  it('refuses a winner change of the source', () => {
    semifinalsCompleted({ matchUpStatus: AWAITING_RESULT });
    expectRefusedAndUntouched(winnerChange, CANNOT_CHANGE_WINNING_SIDE);
  });
});

describe('(c) a downstream holding only a score is active', () => {
  /**
   * Not reachable through `setMatchUpStatus`, which stamps a score with no status IN_PROGRESS; a record loaded from
   * elsewhere can hold it, so the state is written into the record directly.
   */
  function finalHoldsOnlyAScore() {
    semifinalsCompleted();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const matchUp = drawDefinition.structures[0].matchUps.find(({ matchUpId }) => matchUpId === 'm-2-1');
    matchUp.score = score(3, 2);
    matchUp.matchUpStatus = TO_BE_PLAYED;
    tournamentEngine.setState(tournamentRecord);
    expect(final().matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(final().scoreString).toEqual('3-2');
  }

  it.each(unfinishedReScores)('refuses re-scoring the source as unfinished: %s', (_, params, error) => {
    finalHoldsOnlyAScore();
    expectRefusedAndUntouched(params, error);
  });

  it('refuses a winner change of the source', () => {
    finalHoldsOnlyAScore();
    expectRefusedAndUntouched(winnerChange, CANNOT_CHANGE_WINNING_SIDE);
  });
});

describe('(d) control: nothing in play downstream', () => {
  it.each(unfinishedReScores)('the source can still be re-scored as unfinished: %s', (_, params) => {
    semifinalsCompleted();
    expect(final().matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(final().participantIds.filter(Boolean).length).toEqual(2);

    const result = tournamentEngine.setMatchUpStatus({ matchUpId: 'm-1-1', drawId, ...params });
    expect(result.success).toEqual(true);
    // the participant the semifinal had advanced is taken back
    expect(final().participantIds[0]).toBeUndefined();
    expect(final().participantIds[1]).toBeDefined();
  });

  it('a score correction that keeps the winner is still accepted with the final in play', () => {
    semifinalsCompleted({ matchUpStatus: IN_PROGRESS, score: score(3, 2) });
    const finalBefore = final();
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-2', winningSide: 1 });
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: 'm-1-1', outcome, drawId });
    expect(result.success).toEqual(true);
    expect(final()).toEqual(finalBefore);
  });
});
