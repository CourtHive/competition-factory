import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { isPartialDualScore } from '@Scoring/analysis/isPartialDualScore';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { INTENNSE_2026 } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TALLY } from '@Constants/extensionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

/**
 * A level TEAM tie decided outside its score keeps the score as played (concepts/standings.md, "A level result where
 * a winner must advance"). INTENNSE 2026 decides a tie by `aggregateValue`; every segment is scored level, so the tie
 * stands 140-140. Recording the decision with only `score.overtime` wiped the aggregate, with or without auto-calc.
 */
const decision = { decidedIn: 'EXTERNAL', decidedBy: { method: 'OFFICIAL_DECISION' } };

function levelTie(drawType: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType, eventType: TEAM_EVENT, tieFormatName: INTENNSE_2026 }],
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const tie = matchUps.find(
    (matchUp) =>
      matchUp.matchUpType === TEAM_MATCHUP && matchUp.roundNumber === 1 && matchUp.sides.every((s) => s.participantId),
  );
  for (const segment of matchUps.filter(({ matchUpTieId }) => matchUpTieId === tie.matchUpId)) {
    const twoSets = segment.matchUpFormat.startsWith('SET2');
    const sets = twoSets
      ? [
          { setNumber: 1, side1Score: 10, side2Score: 10 },
          { setNumber: 2, side1Score: 10, side2Score: 10 },
        ]
      : [{ setNumber: 1, side1Score: 20, side2Score: 20 }];
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, score: { sets } },
      matchUpId: segment.matchUpId,
      drawId: segment.drawId,
    });
    expect(result.success).toEqual(true);
  }
  return tie;
}

function readTie({ drawId, matchUpId }) {
  return tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true }).matchUp;
}

describe.each([ROUND_ROBIN, SINGLE_ELIMINATION])('%s: a decision on a level TEAM tie', (drawType) => {
  it('starts from a level aggregate', () => {
    const tie = levelTie(drawType);
    const before = readTie(tie);
    expect(before.matchUpStatus).toEqual(IN_PROGRESS);
    expect(before.score.scoreStringSide1).toEqual('140-140');
  });

  it.each([true, false])('keeps the aggregate score (disableAutoCalc: %s)', (disableAutoCalc) => {
    const tie = levelTie(drawType);
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, winningSide: 1, score: { overtime: decision } },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc,
    });
    expect(result.success).toEqual(true);

    const after = readTie(tie);
    expect(after.matchUpStatus).toEqual(COMPLETED);
    expect(after.winningSide).toEqual(1);
    expect(after.score.scoreStringSide1).toEqual('140-140');
    expect(after.score.scoreStringSide2).toEqual('140-140');
    expect(after.score.overtime.decidedIn).toEqual('EXTERNAL');
    expect(after.score.overtime.decidedBy).toEqual(decision.decidedBy);
  });

  // the strings alone do not restate the aggregate either: its sets were dropped, so v1 tallied the tie as 0-0 games
  // (v2 140-140, from the lines: an OutcomePipelineDivergence under differential)
  it('keeps the aggregate when the decision carries the score strings alone', () => {
    const tie = levelTie(drawType);
    const result = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: { scoreStringSide1: '140-140', scoreStringSide2: '140-140', overtime: decision },
        matchUpStatus: COMPLETED,
        winningSide: 1,
      },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc: true,
    });
    expect(result.success).toEqual(true);

    const after = readTie(tie);
    expect(after.score.scoreStringSide1).toEqual('140-140');
    expect(after.score.sets.map(({ side1Score, side2Score }) => [side1Score, side2Score])).toEqual([[140, 140]]);
    if (drawType !== ROUND_ROBIN) return;

    const { tournamentRecord } = tournamentEngine.getTournament();
    const group = tournamentRecord.events[0].drawDefinitions[0].structures[0].structures[0];
    const tallied = group.positionAssignments
      .map((assignment) => firstClassOrExtension({ element: assignment, name: TALLY, attribute: 'tally' }))
      .filter((tally) => tally?.matchUpsWon || tally?.matchUpsLost);
    expect(tallied.map(({ gamesWon, gamesLost }) => [gamesWon, gamesLost])).toEqual([
      [140, 140],
      [140, 140],
    ]);
  });
});

// setMatchUpState is public and runs v1 alone, without setMatchUpStatus's merge: its own guard keeps the aggregate
it('keeps the aggregate when the decision reaches setMatchUpState directly', () => {
  const tie = levelTie(SINGLE_ELIMINATION);
  const result = tournamentEngine.setMatchUpState({
    score: { overtime: decision },
    matchUpId: tie.matchUpId,
    matchUpStatus: COMPLETED,
    disableAutoCalc: true,
    drawId: tie.drawId,
    winningSide: 1,
  });
  expect(result.success).toEqual(true);
  const after = readTie(tie);
  expect(after.score.scoreStringSide1).toEqual('140-140');
  expect(after.score.overtime.decidedBy).toEqual(decision.decidedBy);
});

describe('isPartialDualScore', () => {
  it.each([
    [{ overtime: decision }, true],
    [{ scoreStringSide1: '3-2', scoreStringSide2: '2-3' }, true],
    [{ sets: [], overtime: decision }, false],
    [{ scoreStringSide1: '', scoreStringSide2: '' }, false],
    [{ overtime: undefined }, false],
    [{}, false],
    [[], false],
    [undefined, false],
  ])('%j -> %s', (score, partial) => {
    expect(isPartialDualScore(score)).toEqual(partial);
  });
});
